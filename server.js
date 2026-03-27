const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load system prompt
const PROMPT_PATHS = [
  path.join(__dirname, 'system-prompt.md'),
  path.join(os.homedir(), '.claude', 'commands', 'feedback-coach.md')
];

let SYSTEM_PROMPT = '';
for (const p of PROMPT_PATHS) {
  try {
    SYSTEM_PROMPT = fs.readFileSync(p, 'utf-8');
    // Strip the $ARGUMENTS placeholder — first message serves as input
    SYSTEM_PROMPT = SYSTEM_PROMPT.replace(/## Input\n\$ARGUMENTS\s*$/, '').trim();
    console.log(`Loaded system prompt from ${p}`);
    break;
  } catch {}
}
if (!SYSTEM_PROMPT) {
  console.error('ERROR: Could not find system prompt. Place system-prompt.md in the project directory or ensure ~/.claude/commands/feedback-coach.md exists.');
  process.exit(1);
}

// Load demo prompt
const DEMO_PROMPT_PATHS = [
  path.join(__dirname, 'system-prompt-demo.md'),
  path.join(os.homedir(), '.claude', 'commands', 'feedback-coach-demo.md')
];

let DEMO_PROMPT = '';
for (const p of DEMO_PROMPT_PATHS) {
  try {
    DEMO_PROMPT = fs.readFileSync(p, 'utf-8');
    DEMO_PROMPT = DEMO_PROMPT.replace(/## Input\n\$ARGUMENTS\s*$/, '').trim();
    console.log(`Loaded demo prompt from ${p}`);
    break;
  } catch {}
}
if (!DEMO_PROMPT) {
  console.warn('WARNING: Demo prompt not found. Demo mode will use the main prompt.');
  DEMO_PROMPT = SYSTEM_PROMPT;
}

// Find Claude CLI
function findClaude() {
  const candidates = [
    process.env.CLAUDE_CLI,
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude'
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  // Fallback: try PATH
  try {
    execSync('which claude 2>/dev/null', { encoding: 'utf-8' });
    return 'claude';
  } catch {}
  return null;
}

const CLAUDE_CLI = findClaude();
if (!CLAUDE_CLI) {
  console.error('ERROR: Claude CLI not found. Install it or set CLAUDE_CLI env var.');
  process.exit(1);
}
console.log(`Using Claude CLI: ${CLAUDE_CLI}`);

// Tool status labels for UX
function toolStatusLabel(name) {
  const labels = {
    'mcp__google-workspace__gdrive_search': 'Searching Google Drive',
    'mcp__google-workspace__gdocs_read': 'Reading document',
    'mcp__google-workspace__gdocs_create': 'Creating document',
    'mcp__google-workspace__gdocs_update': 'Updating document',
    'mcp__google-workspace__gsheets_read': 'Reading spreadsheet',
    'mcp__google-workspace__gslides_read': 'Reading presentation',
    'mcp__google-workspace__gmail_search': 'Searching email',
    'mcp__google-workspace__gmail_read': 'Reading email',
    'mcp__google-workspace__gmail_thread': 'Reading email thread',
    'mcp__atlassian__confluence_search': 'Searching Confluence',
    'mcp__atlassian__jira_search': 'Searching Jira',
    'mcp__atlassian__jira_get_issue': 'Reading Jira issue',
    'mcp__slack__slack_search': 'Searching Slack',
    'mcp__slack__slack_read_channel': 'Reading Slack channel',
    'mcp__slack__slack_read_thread': 'Reading Slack thread',
    'mcp__slack__slack_read_message': 'Reading Slack message',
    'mcp__slack__slack_user_info': 'Looking up Slack user',
    'WebFetch': 'Fetching web resource',
  };
  if (labels[name]) return labels[name];
  if (name && name.startsWith('mcp__')) {
    const parts = name.split('__');
    const svc = { 'google-workspace': 'Google', 'atlassian': 'Atlassian', 'slack': 'Slack' }[parts[1]] || parts[1];
    const action = (parts[2] || '').replace(/_/g, ' ');
    return `${svc}: ${action}`;
  }
  return null;
}

// Chat state — single-user, in-memory
let chatHistory = [];
const MAX_HISTORY = 40;
const chatSessions = new Map();

wss.on('connection', (ws) => {
  // Send state on connect
  ws.send(JSON.stringify({
    action: 'init',
    hasHistory: chatHistory.length > 0,
    history: chatHistory
  }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.action === 'chat') {
      handleChat(ws, msg.text, SYSTEM_PROMPT);
    } else if (msg.action === 'chat-demo') {
      handleChat(ws, msg.text, DEMO_PROMPT);
    } else if (msg.action === 'chat-stop') {
      if (chatSessions.has(ws)) {
        chatSessions.get(ws).kill();
        chatSessions.delete(ws);
        ws.send(JSON.stringify({ action: 'chat-stopped' }));
      }
    } else if (msg.action === 'new-session') {
      chatHistory = [];
      if (chatSessions.has(ws)) {
        chatSessions.get(ws).kill();
        chatSessions.delete(ws);
      }
      ws.send(JSON.stringify({ action: 'session-cleared' }));
    }
  });

  ws.on('close', () => {
    if (chatSessions.has(ws)) {
      chatSessions.get(ws).kill();
      chatSessions.delete(ws);
    }
  });
});

function handleChat(ws, userMessage, systemPrompt) {
  if (!userMessage) return;

  // Kill existing process
  if (chatSessions.has(ws)) {
    chatSessions.get(ws).kill();
  }

  ws.send(JSON.stringify({ action: 'chat-start' }));

  // Build full prompt with system prompt + history
  let fullPrompt = systemPrompt + '\n\n';
  if (chatHistory.length > 0) {
    fullPrompt += 'Previous conversation:\n\n';
    fullPrompt += chatHistory.map(m =>
      `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`
    ).join('\n\n');
    fullPrompt += '\n\n';
  }
  fullPrompt += `Human: ${userMessage}`;

  chatHistory.push({ role: 'user', content: userMessage });

  const args = ['-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages', fullPrompt];
  const claude = spawn(CLAUDE_CLI, args, {
    env: { ...process.env, HOME: os.homedir() },
    cwd: os.homedir()
  });

  chatSessions.set(ws, claude);

  let output = '';
  let buffer = '';
  let inThinking = false;
  let thinkingText = '';
  let activeTools = [];

  claude.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const event = parsed.type === 'stream_event' ? parsed.event : parsed;
        const eventType = event?.type || parsed.type;

        if (eventType === 'message_start') {
          ws.send(JSON.stringify({ action: 'chat-status', text: 'Thinking...' }));
        } else if (eventType === 'content_block_start') {
          const block = event.content_block || {};
          if (block.type === 'thinking') {
            inThinking = true;
            thinkingText = '';
            ws.send(JSON.stringify({ action: 'chat-thinking-start' }));
          } else if (block.type === 'tool_use' && block.name) {
            const label = toolStatusLabel(block.name);
            if (label) {
              activeTools.push(label);
              ws.send(JSON.stringify({ action: 'chat-tool', tools: [...activeTools] }));
            }
          }
        } else if (eventType === 'content_block_delta') {
          const delta = event.delta || {};
          if (inThinking) {
            const text = delta.thinking || delta.text || '';
            if (text) {
              thinkingText += text;
              ws.send(JSON.stringify({ action: 'chat-thinking-delta', text }));
            }
          } else if (delta.type === 'text_delta' && delta.text) {
            output += delta.text;
            ws.send(JSON.stringify({ action: 'chat-chunk', text: delta.text }));
          }
        } else if (eventType === 'content_block_stop') {
          if (inThinking) {
            inThinking = false;
            ws.send(JSON.stringify({ action: 'chat-thinking-done', text: thinkingText }));
          } else if (activeTools.length > 0) {
            activeTools.pop();
            ws.send(JSON.stringify({ action: 'chat-tool', tools: [...activeTools] }));
          }
        } else if (parsed.type === 'result' || eventType === 'result') {
          const result = parsed.result || event.result;
          if (result) {
            output = result;
            ws.send(JSON.stringify({ action: 'chat-result', text: result }));
          }
        }
      } catch {
        output += line;
        ws.send(JSON.stringify({ action: 'chat-chunk', text: line }));
      }
    }
  });

  claude.stderr.on('data', () => {});

  claude.on('close', () => {
    chatSessions.delete(ws);
    if (output) {
      chatHistory.push({ role: 'assistant', content: output });
      while (chatHistory.length > MAX_HISTORY * 2) {
        chatHistory.splice(0, 2);
      }
    }
    ws.send(JSON.stringify({ action: 'chat-done' }));
  });

  claude.on('error', (err) => {
    chatSessions.delete(ws);
    ws.send(JSON.stringify({ action: 'chat-error', text: err.message }));
  });
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, cli: CLAUDE_CLI, hasHistory: chatHistory.length > 0 });
});

server.listen(PORT, () => {
  console.log(`\nFeedback Coach running at http://localhost:${PORT}\n`);
});
