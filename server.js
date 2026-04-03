const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3456;

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  const origin = CORS_ORIGIN === '*' ? (req.headers.origin || '*') : CORS_ORIGIN;
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const USER_TOKENS_FILE = path.join(__dirname, '.user-tokens.json');
const SESSION_HOME_ROOT = path.join(__dirname, '.session-home');
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://feedback-coach-api.int-tools.cmtelematics.com/api/auth/callback'
    : `http://localhost:${PORT}/api/auth/callback`);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SLACK_CLIENT_ID_OAUTH = process.env.SLACK_CLIENT_ID_OAUTH || '';
const SLACK_CLIENT_SECRET_OAUTH = process.env.SLACK_CLIENT_SECRET_OAUTH || '';
const ATLASSIAN_SITE = process.env.ATLASSIAN_SITE || 'https://cmtelematics.atlassian.net';
const GOOGLE_MCP_URL = process.env.GOOGLE_MCP_URL || 'https://portal.int-tools.cmtelematics.com/google-workspace-mcp/mcp';
const SLACK_MCP_URL = process.env.SLACK_MCP_URL || 'https://portal.int-tools.cmtelematics.com/slack-mcp/mcp';

const DIRECT_OAUTH_PROVIDERS = {
  'google-workspace': {
    name: 'Google Workspace',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/tasks.readonly',
  },
  slack: {
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    clientId: SLACK_CLIENT_ID_OAUTH,
    clientSecret: SLACK_CLIENT_SECRET_OAUTH,
    scope: 'search:read,channels:read,groups:read,im:read,mpim:read,users:read',
  },
};

const userTokenStore = new Map();
const pendingOauthFlows = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(USER_TOKENS_FILE, 'utf-8'));
  for (const [sid, data] of Object.entries(saved)) {
    if (Date.now() - (data.createdAt || 0) < SESSION_MAX_AGE) {
      userTokenStore.set(sid, data);
    }
  }
} catch {}

let tokenSaveTimer = null;
function saveUserTokens() {
  if (tokenSaveTimer) clearTimeout(tokenSaveTimer);
  tokenSaveTimer = setTimeout(() => {
    const serialized = {};
    for (const [sid, data] of userTokenStore) serialized[sid] = data;
    fs.writeFile(USER_TOKENS_FILE, JSON.stringify(serialized), () => {});
  }, 250);
}

function getCipherKey() {
  return crypto.scryptSync(SESSION_SECRET, 'feedback-coach-salt', 32);
}

function encryptToken(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getCipherKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptToken(value) {
  try {
    const [ivHex, encrypted] = value.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getCipherKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(src, dest) {
  try {
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  } catch {}
}

function ensureSymlink(target, linkPath) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) return;
  } catch {}
  try {
    if (fs.existsSync(linkPath)) fs.rmSync(linkPath, { recursive: true, force: true });
  } catch {}
  try {
    fs.symlinkSync(target, linkPath);
  } catch {}
}

function buildSessionMcpConfig(session) {
  const mcpServers = {};
  const googleToken = session?.tokens?.['google-workspace']?.accessToken
    ? decryptToken(session.tokens['google-workspace'].accessToken)
    : null;
  const slackToken = session?.tokens?.slack?.accessToken
    ? decryptToken(session.tokens.slack.accessToken)
    : null;
  const atlassianToken = session?.tokens?.atlassian?.token
    ? decryptToken(session.tokens.atlassian.token)
    : null;
  const atlassianEmail = session?.tokens?.atlassian?.email || null;

  if (googleToken) {
    mcpServers['google-workspace'] = {
      url: GOOGLE_MCP_URL,
      headers: {
        Authorization: `Bearer ${googleToken}`,
      },
    };
  }

  if (slackToken) {
    mcpServers.slack = {
      url: SLACK_MCP_URL,
      headers: {
        Authorization: `Bearer ${slackToken}`,
      },
    };
  }

  if (atlassianEmail && atlassianToken) {
    mcpServers.atlassian = {
      command: 'npx',
      args: [
        '-y',
        '@xuandev/atlassian-mcp',
        '--jira-url',
        ATLASSIAN_SITE,
        '--jira-username',
        atlassianEmail,
        '--jira-token',
        atlassianToken,
        '--confluence-url',
        `${ATLASSIAN_SITE}/wiki`,
        '--confluence-username',
        atlassianEmail,
        '--confluence-token',
        atlassianToken,
      ],
      env: {},
    };
  }

  return { mcpServers };
}

function writeSessionClaudeJson(realHome, sessionHome) {
  const source = path.join(realHome, '.claude.json');
  const dest = path.join(sessionHome, '.claude.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(source, 'utf-8'));
    parsed.mcpServers = {};
    parsed.projects = {};
    fs.writeFileSync(dest, JSON.stringify(parsed, null, 2));
  } catch {
    fs.writeFileSync(dest, JSON.stringify({ mcpServers: {}, projects: {} }, null, 2));
  }
}

function ensureSessionClaudeHome(sessionId, session) {
  const realHome = os.homedir();
  const sessionHome = path.join(SESSION_HOME_ROOT, sessionId);
  ensureDir(sessionHome);
  ensureDir(path.join(sessionHome, '.claude'));

  writeSessionClaudeJson(realHome, sessionHome);
  copyIfExists(path.join(realHome, '.oauth-clients.json'), path.join(sessionHome, '.oauth-clients.json'));

  ensureSymlink(path.join(realHome, '.claude', 'commands'), path.join(sessionHome, '.claude', 'commands'));
  ensureSymlink(path.join(realHome, '.claude', 'skills'), path.join(sessionHome, '.claude', 'skills'));

  const sessionMcp = buildSessionMcpConfig(session);
  fs.writeFileSync(path.join(sessionHome, '.mcp.json'), JSON.stringify(sessionMcp, null, 2));

  return sessionHome;
}

app.use((req, res, next) => {
  let sid = req.cookies?.feedback_coach_sid;
  if (!sid || !userTokenStore.has(sid)) {
    sid = crypto.randomBytes(24).toString('hex');
    const cookieOpts = { httpOnly: true, path: '/', maxAge: SESSION_MAX_AGE };
    if (process.env.NODE_ENV === 'production') {
      cookieOpts.secure = true;
      cookieOpts.sameSite = 'none';
    }
    res.cookie('feedback_coach_sid', sid, cookieOpts);
    userTokenStore.set(sid, { tokens: {}, createdAt: Date.now() });
    saveUserTokens();
  }
  req.sessionId = sid;
  req.userSession = userTokenStore.get(sid);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const PROMPT_PATHS = [
  path.join(__dirname, 'system-prompt.md'),
  path.join(os.homedir(), '.claude', 'commands', 'feedback-coach.md')
];

let SYSTEM_PROMPT = '';
for (const p of PROMPT_PATHS) {
  try {
    SYSTEM_PROMPT = fs.readFileSync(p, 'utf-8');
    SYSTEM_PROMPT = SYSTEM_PROMPT.replace(/## Input\n\$ARGUMENTS\s*$/, '').trim();
    console.log(`Loaded system prompt from ${p}`);
    break;
  } catch {}
}
if (!SYSTEM_PROMPT) {
  console.error('ERROR: Could not find system prompt. Place system-prompt.md in the project directory or ensure ~/.claude/commands/feedback-coach.md exists.');
  process.exit(1);
}

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

function getOrCreateSession(req) {
  let session = req.userSession;
  if (!session) {
    session = { tokens: {}, createdAt: Date.now() };
    userTokenStore.set(req.sessionId, session);
  }
  if (!session.tokens) session.tokens = {};
  return session;
}

function saveAtlassianCredentials(session, email, token) {
  try {
    session.tokens.atlassian = {
      email,
      token: encryptToken(token),
      updatedAt: Date.now(),
    };
    saveUserTokens();
    return true;
  } catch {
    return false;
  }
}

async function exchangeOauthCode(provider, code) {
  const conf = DIRECT_OAUTH_PROVIDERS[provider];
  if (!conf || !conf.clientId || !conf.clientSecret) throw new Error(`${provider} OAuth is not configured`);
  const params = new URLSearchParams({
    code,
    redirect_uri: OAUTH_CALLBACK_URL,
    client_id: conf.clientId,
    client_secret: conf.clientSecret,
  });
  if (provider === 'slack') {
    params.set('grant_type', 'authorization_code');
  } else {
    params.set('grant_type', 'authorization_code');
  }
  const resp = await fetch(conf.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!resp.ok) throw new Error(`Token exchange failed (${resp.status})`);
  const payload = await resp.json();
  if (provider === 'slack') {
    if (!payload.ok || !payload.authed_user?.access_token) throw new Error(payload.error || 'Slack authorization failed');
    return {
      accessToken: payload.authed_user.access_token,
      refreshToken: payload.authed_user.refresh_token || null,
      expiresIn: payload.authed_user.expires_in || null,
    };
  }
  if (!payload.access_token) throw new Error('Missing access token');
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || null,
    expiresIn: payload.expires_in || null,
  };
}

async function testGoogleConnection(token) {
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.ok;
}

async function testSlackConnection(token) {
  const resp = await fetch('https://slack.com/api/auth.test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return false;
  const data = await resp.json();
  return !!data.ok;
}

async function testAtlassianConnection(email, token) {
  const basic = Buffer.from(`${email}:${token}`).toString('base64');
  const resp = await fetch(`${ATLASSIAN_SITE}/rest/api/3/project/search?maxResults=1`, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
    },
  });
  return resp.ok;
}

async function validateGoogleIdentity(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const [gmailResp, peopleResp] = await Promise.all([
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers }),
    fetch('https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses', { headers }),
  ]);
  if (!gmailResp.ok) {
    return { ok: false, error: `Google validation failed (${gmailResp.status})` };
  }
  const gmail = await gmailResp.json();
  let profile = {};
  if (peopleResp.ok) {
    profile = await peopleResp.json();
  }
  return {
    ok: true,
    provider: 'google-workspace',
    email: gmail.emailAddress || profile.emailAddresses?.[0]?.value || null,
    name: profile.names?.[0]?.displayName || null,
    detail: `Gmail mailbox ${gmail.emailAddress || 'available'}`,
  };
}

async function validateSlackIdentity(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const authResp = await fetch('https://slack.com/api/auth.test', { headers });
  if (!authResp.ok) {
    return { ok: false, error: `Slack validation failed (${authResp.status})` };
  }
  const auth = await authResp.json();
  if (!auth.ok) return { ok: false, error: auth.error || 'Slack validation failed' };
  let userName = null;
  if (auth.user_id) {
    const userResp = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(auth.user_id)}`, { headers });
    if (userResp.ok) {
      const user = await userResp.json();
      if (user.ok) {
        userName = user.user?.real_name || user.user?.profile?.display_name || user.user?.name || null;
      }
    }
  }
  return {
    ok: true,
    provider: 'slack',
    team: auth.team || null,
    user: userName || auth.user || null,
    detail: auth.url || null,
  };
}

async function validateAtlassianIdentity(email, token) {
  const basic = Buffer.from(`${email}:${token}`).toString('base64');
  const resp = await fetch(`${ATLASSIAN_SITE}/rest/api/3/myself`, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    return { ok: false, error: `Atlassian validation failed (${resp.status})` };
  }
  const me = await resp.json();
  return {
    ok: true,
    provider: 'atlassian',
    email: me.emailAddress || email,
    name: me.displayName || null,
    detail: me.accountType || 'Atlassian account',
  };
}

async function getIntegrationStatus(session) {
  const status = {
    'google-workspace': false,
    slack: false,
    atlassian: false,
  };
  const google = session?.tokens?.['google-workspace'];
  const slack = session?.tokens?.slack;
  const atlassian = session?.tokens?.atlassian;
  if (google?.accessToken) status['google-workspace'] = await testGoogleConnection(decryptToken(google.accessToken));
  if (slack?.accessToken) status.slack = await testSlackConnection(decryptToken(slack.accessToken));
  if (atlassian?.email && atlassian?.token) status.atlassian = await testAtlassianConnection(atlassian.email, decryptToken(atlassian.token));
  return status;
}

app.get('/api/auth/:provider/start', async (req, res) => {
  const provider = req.params.provider;
  const conf = DIRECT_OAUTH_PROVIDERS[provider];
  if (!conf) return res.status(400).json({ ok: false, error: 'Unknown provider' });
  if (!conf.clientId || !conf.clientSecret) {
    return res.json({ ok: false, error: `${conf.name} OAuth is not configured on the server` });
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingOauthFlows.set(state, {
    provider,
    sessionId: req.sessionId,
    createdAt: Date.now(),
  });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: conf.clientId,
    redirect_uri: OAUTH_CALLBACK_URL,
    state,
  });
  if (provider === 'slack') {
    params.set('user_scope', conf.scope);
  } else {
    params.set('scope', conf.scope);
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }
  res.json({ ok: true, authUrl: `${conf.authUrl}?${params.toString()}` });
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.send(`<html><body><h2>Authorization failed</h2><p>${error}</p><script>window.close()</script></body></html>`);
  }
  const flow = pendingOauthFlows.get(state);
  if (!flow) {
    return res.send('<html><body><h2>Expired sign-in session</h2><script>window.close()</script></body></html>');
  }
  pendingOauthFlows.delete(state);
  try {
    const tokens = await exchangeOauthCode(flow.provider, code);
    const session = userTokenStore.get(flow.sessionId) || { tokens: {}, createdAt: Date.now() };
    if (!session.tokens) session.tokens = {};
    session.tokens[flow.provider] = {
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      expiresAt: tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : null,
      updatedAt: Date.now(),
    };
    userTokenStore.set(flow.sessionId, session);
    saveUserTokens();
    res.send(`<html><body><h2>${DIRECT_OAUTH_PROVIDERS[flow.provider].name} connected</h2><script>
      if (window.opener) window.opener.postMessage({ type: 'oauth-complete', provider: '${flow.provider}', ok: true }, '*');
      setTimeout(() => window.close(), 800);
    </script></body></html>`);
  } catch (err) {
    res.send(`<html><body><h2>Authorization failed</h2><p>${err.message}</p><script>
      if (window.opener) window.opener.postMessage({ type: 'oauth-complete', provider: '${flow.provider}', ok: false }, '*');
      setTimeout(() => window.close(), 2000);
    </script></body></html>`);
  }
});

app.get('/api/auth/:provider/status', async (req, res) => {
  const provider = req.params.provider;
  if (provider !== 'google-workspace' && provider !== 'slack') {
    return res.status(400).json({ ok: false, error: 'Unsupported provider' });
  }
  const status = await getIntegrationStatus(getOrCreateSession(req));
  res.json({ ok: true, connected: !!status[provider] });
});

app.post('/api/auth/:provider/disconnect', (req, res) => {
  const provider = req.params.provider;
  const session = getOrCreateSession(req);
  if (session.tokens?.[provider]) delete session.tokens[provider];
  saveUserTokens();
  res.json({ ok: true });
});

app.post('/api/integrations/atlassian/credentials', async (req, res) => {
  const { email, token } = req.body || {};
  if (!email || !token) {
    return res.status(400).json({ ok: false, error: 'Email and token are required' });
  }
  const good = await testAtlassianConnection(email, token);
  if (!good) {
    return res.json({ ok: false, error: 'Atlassian credentials were rejected' });
  }
  const saved = saveAtlassianCredentials(getOrCreateSession(req), email, token);
  if (!saved) return res.json({ ok: false, error: 'Failed to save credentials' });
  res.json({ ok: true });
});

app.get('/api/integrations/status', async (req, res) => {
  const status = await getIntegrationStatus(getOrCreateSession(req));
  res.json({ ok: true, status });
});

app.get('/api/integrations/validate/:provider', async (req, res) => {
  const provider = req.params.provider;
  const session = getOrCreateSession(req);
  try {
    if (provider === 'google-workspace') {
      const token = session?.tokens?.['google-workspace']?.accessToken
        ? decryptToken(session.tokens['google-workspace'].accessToken)
        : null;
      if (!token) return res.json({ ok: false, error: 'Google is not connected' });
      return res.json(await validateGoogleIdentity(token));
    }
    if (provider === 'slack') {
      const token = session?.tokens?.slack?.accessToken
        ? decryptToken(session.tokens.slack.accessToken)
        : null;
      if (!token) return res.json({ ok: false, error: 'Slack is not connected' });
      return res.json(await validateSlackIdentity(token));
    }
    if (provider === 'atlassian') {
      const email = session?.tokens?.atlassian?.email || null;
      const token = session?.tokens?.atlassian?.token
        ? decryptToken(session.tokens.atlassian.token)
        : null;
      if (!email || !token) return res.json({ ok: false, error: 'Atlassian is not connected' });
      return res.json(await validateAtlassianIdentity(email, token));
    }
    return res.status(400).json({ ok: false, error: 'Unknown provider' });
  } catch (err) {
    return res.json({ ok: false, error: err.message || 'Validation failed' });
  }
});

function detectPrefetchIntents(prompt) {
  const lower = prompt.toLowerCase();
  const intents = [];
  if (/\b(email|gmail|inbox|calendar|drive|google doc|google sheet|google slide|tasks)\b/.test(lower)) {
    if (/\b(calendar|meeting|schedule|today)\b/.test(lower)) {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      intents.push({ provider: 'google-workspace', tool: 'calendar', label: 'Checking Google Calendar...' });
    } else if (/\b(tasks|todo|to-do)\b/.test(lower)) {
      intents.push({ provider: 'google-workspace', tool: 'tasks', label: 'Loading Google Tasks...' });
    } else if (/\b(drive|doc|sheet|slide)\b/.test(lower)) {
      intents.push({ provider: 'google-workspace', tool: 'drive', query: prompt, label: 'Searching Google Drive...' });
    } else {
      intents.push({ provider: 'google-workspace', tool: 'gmail', query: prompt, label: 'Checking Gmail...' });
    }
  }
  if (/\b(slack|channel|dm|direct message|thread|message)\b/.test(lower)) {
    intents.push({ provider: 'slack', tool: 'slack', query: prompt, label: 'Searching Slack...' });
  }
  if (/\b(jira|ticket|confluence|atlassian)\b/.test(lower)) {
    intents.push({ provider: 'atlassian', tool: 'atlassian', query: prompt, label: 'Checking Atlassian...' });
  }
  return intents;
}

async function prefetchGoogle(intent, token) {
  const headers = { Authorization: `Bearer ${token}` };
  if (intent.tool === 'calendar') {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      maxResults: '10',
    });
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.items?.length) return 'No events found on the connected Google calendar for today.';
    return `Connected Google calendar events:\n${data.items.map((e) => `- ${e.summary || '(no title)'} | ${e.start?.dateTime || e.start?.date || '?'} | ${e.location || ''}`).join('\n')}`;
  }
  if (intent.tool === 'tasks') {
    const listsResp = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', { headers });
    if (!listsResp.ok) return null;
    const listsData = await listsResp.json();
    const lines = [];
    for (const list of (listsData.items || []).slice(0, 3)) {
      const tasksResp = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?maxResults=10&showCompleted=false`, { headers });
      if (!tasksResp.ok) continue;
      const tasks = await tasksResp.json();
      for (const task of (tasks.items || []).slice(0, 5)) {
        lines.push(`- [${list.title}] ${task.title || '(no title)'}`);
      }
    }
    return lines.length ? `Connected Google tasks:\n${lines.join('\n')}` : 'No open Google Tasks found.';
  }
  if (intent.tool === 'drive') {
    const q = intent.query.replace(/'/g, '');
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`fullText contains '${q}'`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=8`, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.files?.length) return 'No matching Google Drive files were found for the connected account.';
    return `Connected Google Drive matches:\n${data.files.map((f) => `- ${f.name} (${f.mimeType}) | ${f.webViewLink || ''}`).join('\n')}`;
  }
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(intent.query)}&maxResults=5`, { headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.messages?.length) return 'No Gmail messages matched this request.';
  return `Connected Gmail matches: ${data.messages.length} messages found for this account.`;
}

async function prefetchSlack(intent, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const resp = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(intent.query)}&count=8`, { headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.ok || !data.messages?.matches?.length) return 'No Slack messages matched this request.';
  return `Connected Slack matches:\n${data.messages.matches.slice(0, 8).map((m) => `- #${m.channel?.name || '?'} | ${m.username || '?'}: ${(m.text || '').slice(0, 180)}`).join('\n')}`;
}

async function prefetchAtlassian(intent, email, token) {
  const basic = Buffer.from(`${email}:${token}`).toString('base64');
  const headers = {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
  };
  const jql = encodeURIComponent(`text ~ "${intent.query.replace(/"/g, '')}" ORDER BY updated DESC`);
  const jiraResp = await fetch(`${ATLASSIAN_SITE}/rest/api/3/search/jql?jql=${jql}&maxResults=5&fields=summary,status,assignee`, { headers });
  if (!jiraResp.ok) return null;
  const jira = await jiraResp.json();
  if (!jira.issues?.length) return 'No Jira issues matched this request.';
  return `Connected Jira matches:\n${jira.issues.map((issue) => `- ${issue.key}: ${issue.fields?.summary || '(no summary)'} | ${issue.fields?.status?.name || '?'}`).join('\n')}`;
}

async function buildPrefetchContext(session, userMessage) {
  const intents = detectPrefetchIntents(userMessage);
  if (!intents.length) return { labels: [], context: '' };
  const labels = intents.map((i) => i.label);
  const blocks = [];
  for (const intent of intents) {
    try {
      if (intent.provider === 'google-workspace' && session?.tokens?.['google-workspace']?.accessToken) {
        const token = decryptToken(session.tokens['google-workspace'].accessToken);
        const data = await prefetchGoogle(intent, token);
        if (data) blocks.push(`[CONNECTED GOOGLE DATA]\n${data}`);
      } else if (intent.provider === 'slack' && session?.tokens?.slack?.accessToken) {
        const token = decryptToken(session.tokens.slack.accessToken);
        const data = await prefetchSlack(intent, token);
        if (data) blocks.push(`[CONNECTED SLACK DATA]\n${data}`);
      } else if (intent.provider === 'atlassian' && session?.tokens?.atlassian?.email && session?.tokens?.atlassian?.token) {
        const data = await prefetchAtlassian(intent, session.tokens.atlassian.email, decryptToken(session.tokens.atlassian.token));
        if (data) blocks.push(`[CONNECTED ATLASSIAN DATA]\n${data}`);
      }
    } catch {}
  }
  return { labels, context: blocks.length ? `${blocks.join('\n\n')}\n\n` : '' };
}

let chatHistory = [];
const MAX_HISTORY = 40;
const chatSessions = new Map();

function parseCookieHeader(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach((pair) => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

wss.on('connection', (ws, req) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  ws.sessionId = cookies.feedback_coach_sid || null;
  ws.userSession = ws.sessionId ? userTokenStore.get(ws.sessionId) : null;

  ws.send(JSON.stringify({
    action: 'init',
    hasHistory: chatHistory.length > 0,
    history: chatHistory,
  }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.action === 'chat') {
      await handleChat(ws, msg.text, SYSTEM_PROMPT);
    } else if (msg.action === 'chat-demo') {
      await handleChat(ws, msg.text, DEMO_PROMPT);
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

async function handleChat(ws, userMessage, systemPrompt) {
  if (!userMessage) return;
  if (chatSessions.has(ws)) chatSessions.get(ws).kill();
  ws.send(JSON.stringify({ action: 'chat-start' }));

  if (!ws.userSession && ws.sessionId) {
    ws.userSession = userTokenStore.get(ws.sessionId);
  }
  if (!ws.sessionId) {
    ws.sessionId = crypto.randomBytes(24).toString('hex');
    ws.userSession = ws.userSession || { tokens: {}, createdAt: Date.now() };
    userTokenStore.set(ws.sessionId, ws.userSession);
    saveUserTokens();
  }

  const prefetch = await buildPrefetchContext(ws.userSession, userMessage);
  for (const label of prefetch.labels) {
    ws.send(JSON.stringify({ action: 'chat-status', text: label }));
  }

  const sessionHome = ensureSessionClaudeHome(ws.sessionId, ws.userSession || { tokens: {} });

  let fullPrompt = `${systemPrompt}\n\n`;
  if (prefetch.context) {
    fullPrompt += `The user has connected personal integrations. Use the prefetched account data below as ground truth when it is relevant, and avoid asking the user to reconnect if the data is already present.\n\n${prefetch.context}`;
  }
  if (chatHistory.length > 0) {
    fullPrompt += 'Previous conversation:\n\n';
    fullPrompt += chatHistory.map((m) =>
      `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`
    ).join('\n\n');
    fullPrompt += '\n\n';
  }
  fullPrompt += `Human: ${userMessage}`;

  chatHistory.push({ role: 'user', content: userMessage });

  const args = ['-p', '--verbose', '--output-format', 'stream-json', '--include-partial-messages', fullPrompt];
  const claude = spawn(CLAUDE_CLI, args, {
    env: { ...process.env, HOME: sessionHome },
    cwd: sessionHome,
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
      while (chatHistory.length > MAX_HISTORY * 2) chatHistory.splice(0, 2);
    }
    ws.send(JSON.stringify({ action: 'chat-done' }));
  });

  claude.on('error', (err) => {
    chatSessions.delete(ws);
    ws.send(JSON.stringify({ action: 'chat-error', text: err.message }));
  });
}

app.get('/api/health', async (req, res) => {
  const status = await getIntegrationStatus(getOrCreateSession(req));
  res.json({ ok: true, cli: CLAUDE_CLI, hasHistory: chatHistory.length > 0, integrations: status });
});

setInterval(() => {
  const now = Date.now();
  for (const [state, flow] of pendingOauthFlows) {
    if (now - flow.createdAt > 10 * 60 * 1000) pendingOauthFlows.delete(state);
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`\nFeedback Coach running at http://localhost:${PORT}\n`);
});
