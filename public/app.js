// ── State ──────────────────────────────────────────────────
let ws;
let isGenerating = false;
let currentMode = '';
let currentPeriod = '2 weeks';
let currentOutput = '';
let currentBubble = null;
let thinkingText = '';
let thinkingEl = null;

function getConfiguredWsBase() {
  const explicitWsBase = window.FEEDBACK_COACH_WS_BASE;
  if (explicitWsBase) {
    return explicitWsBase.replace(/\/$/, '');
  }

  const apiBase = window.FEEDBACK_COACH_API_BASE;
  if (apiBase) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}

// ── DOM refs ──────────────────────────────────────────────
const $welcome = document.getElementById('welcome');
const $chat = document.getElementById('chat-view');
const $messages = document.getElementById('messages');
const $input = document.getElementById('chat-input');
const $sendBtn = document.getElementById('send-btn');
const $stopBtn = document.getElementById('stop-btn');
const $toolBar = document.getElementById('tool-bar');
const $toolLabel = document.getElementById('tool-label');
const $sessionBadge = document.getElementById('session-badge');
const $headerStatus = document.getElementById('header-status');
const $resumeBtn = document.getElementById('resume-btn');

// ── WebSocket ─────────────────────────────────────────────
function connect() {
  ws = new WebSocket(getConfiguredWsBase());

  ws.onopen = () => {};

  ws.onclose = () => {
    setTimeout(connect, 2000);
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };
}

function handleMessage(msg) {
  switch (msg.action) {
    case 'init':
      if (msg.hasHistory && msg.history && msg.history.length > 0) {
        // Show resume button on welcome screen
        $resumeBtn.classList.remove('hidden');
        // Store history for resume
        window._pendingHistory = msg.history;
      }
      break;

    case 'chat-start':
      isGenerating = true;
      currentOutput = '';
      currentBubble = null;
      showLoadingIndicator();
      showActivityBar('Starting session...');
      updateInputState();
      break;

    case 'chat-status':
      updateActivityBar(msg.text);
      break;

    case 'chat-thinking-start':
      thinkingText = '';
      removeLoadingIndicator();
      showThinkingBubble();
      updateActivityBar('Thinking...');
      break;

    case 'chat-thinking-delta':
      thinkingText += msg.text;
      updateThinkingPreview();
      break;

    case 'chat-thinking-done':
      removeThinkingBubble();
      updateActivityBar('Working...');
      break;

    case 'chat-tool':
      if (msg.tools && msg.tools.length > 0) {
        updateActivityBar(msg.tools[msg.tools.length - 1]);
      }
      break;

    case 'chat-chunk':
      removeLoadingIndicator();
      updateActivityBar('Composing response...');
      appendChunk(msg.text);
      break;

    case 'chat-result':
      // Final result replaces streamed output
      if (currentBubble) {
        currentOutput = msg.text;
        renderBubbleContent(currentBubble, currentOutput);
      }
      break;

    case 'chat-done':
      isGenerating = false;
      hideActivityBar();
      removeLoadingIndicator();
      removeThinkingBubble();
      finalizeBubble();
      updateInputState();
      break;

    case 'chat-stopped':
      isGenerating = false;
      hideActivityBar();
      finalizeBubble();
      updateInputState();
      $headerStatus.textContent = 'Stopped';
      setTimeout(() => { $headerStatus.textContent = ''; }, 3000);
      break;

    case 'chat-error':
      isGenerating = false;
      hideActivityBar();
      removeLoadingIndicator();
      removeThinkingBubble();
      addErrorMessage(msg.text);
      updateInputState();
      break;

    case 'session-cleared':
      $messages.innerHTML = '';
      break;
  }
}

// ── Chat UI ───────────────────────────────────────────────
function addMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message msg-${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (role === 'assistant') {
    renderBubbleContent(bubble, content);
  } else {
    bubble.textContent = content;
  }

  wrap.appendChild(bubble);
  $messages.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

// ── Loading indicator (shown immediately on session start) ─
let loadingEl = null;

function showLoadingIndicator() {
  removeLoadingIndicator();
  loadingEl = document.createElement('div');
  loadingEl.className = 'loading-indicator';
  loadingEl.innerHTML = `
    <div class="loading-inner">
      <div class="loading-spinner"></div>
      <div class="loading-text">
        <span class="loading-title">Starting session</span>
        <span class="loading-sub">Connecting to Claude and loading your profile...</span>
      </div>
    </div>
  `;
  $messages.appendChild(loadingEl);
  scrollToBottom();
}

function removeLoadingIndicator() {
  if (loadingEl) {
    loadingEl.remove();
    loadingEl = null;
  }
}

// ── Live thinking bubble ──────────────────────────────────
function showThinkingBubble() {
  removeThinkingBubble(); // clean up any stale one
  thinkingEl = document.createElement('div');
  thinkingEl.className = 'thinking-bubble';
  thinkingEl.innerHTML = `
    <div class="thinking-inner">
      <div class="thinking-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div class="thinking-body">
        <div class="thinking-label">
          Thinking<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
        </div>
        <div class="thinking-preview" id="thinking-preview"></div>
      </div>
    </div>
  `;
  $messages.appendChild(thinkingEl);
  scrollToBottom();
}

function updateThinkingPreview() {
  const preview = document.getElementById('thinking-preview');
  if (!preview) return;
  // Show last ~200 chars of thinking for a live preview
  const text = thinkingText.length > 200
    ? thinkingText.slice(-200)
    : thinkingText;
  preview.textContent = text;
  scrollToBottom();
}

function removeThinkingBubble() {
  if (thinkingEl) {
    thinkingEl.remove();
    thinkingEl = null;
  }
}

function addErrorMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message msg-assistant';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.style.borderColor = 'var(--error)';
  bubble.style.color = 'var(--error)';
  bubble.textContent = 'Error: ' + text;
  wrap.appendChild(bubble);
  $messages.appendChild(wrap);
  scrollToBottom();
}

function startAssistantMessage() {
  const wrap = document.createElement('div');
  wrap.className = 'message msg-assistant';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble streaming-cursor';

  wrap.appendChild(bubble);
  $messages.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function appendChunk(text) {
  if (!currentBubble) {
    currentBubble = startAssistantMessage();
  }
  currentOutput += text;
  renderBubbleContent(currentBubble, currentOutput);
  scrollToBottom();
}

function renderBubbleContent(bubble, content) {
  // Build HTML: thinking toggle (if any) + rendered markdown
  let html = '';

  // Add thinking toggle if we have thinking text and this is during generation
  if (thinkingText && currentBubble === bubble) {
    html += buildThinkingToggle(thinkingText);
  }

  html += marked.parse(content || '', { breaks: true });
  bubble.innerHTML = html;
}

function buildThinkingToggle(text) {
  const id = 'think-' + Date.now();
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <button class="thinking-toggle" onclick="toggleThinking('${id}', this)">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M3 1l5 4-5 4z"/></svg>
      Thinking
    </button>
    <div class="thinking-content" id="${id}">${escaped}</div>
  `;
}

function finalizeBubble() {
  if (currentBubble) {
    currentBubble.classList.remove('streaming-cursor');
    // Re-render with thinking toggle included
    renderBubbleContent(currentBubble, currentOutput);
    currentBubble = null;
    currentOutput = '';
    thinkingText = '';
  }
}

function toggleThinking(id, btn) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('open');
    btn.classList.toggle('open');
  }
}
// Expose globally for onclick
window.toggleThinking = toggleThinking;

function scrollToBottom() {
  requestAnimationFrame(() => {
    $messages.scrollTop = $messages.scrollHeight;
  });
}

// ── Activity bar (persistent during generation) ──────────
function showActivityBar(text) {
  $toolBar.classList.remove('hidden');
  $toolLabel.textContent = text;
  $headerStatus.textContent = text;
}

function updateActivityBar(text) {
  $toolLabel.textContent = text;
  $headerStatus.textContent = text;
  // Ensure visible
  $toolBar.classList.remove('hidden');
}

function hideActivityBar() {
  $toolBar.classList.add('hidden');
  $headerStatus.textContent = '';
}

// ── Input handling ────────────────────────────────────────
function updateInputState() {
  $sendBtn.classList.toggle('hidden', isGenerating);
  $stopBtn.classList.toggle('hidden', !isGenerating);
  $sendBtn.disabled = isGenerating;
  $input.disabled = isGenerating;
  if (!isGenerating) $input.focus();
}

function sendMessage() {
  const text = $input.value.trim();
  if (!text || isGenerating) return;

  addMessage('user', text);
  $input.value = '';
  $input.style.height = 'auto';

  ws.send(JSON.stringify({ action: 'chat', text }));
}

function stopGeneration() {
  ws.send(JSON.stringify({ action: 'chat-stop' }));
}

// Auto-resize textarea
$input.addEventListener('input', () => {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
});

// Enter to send, Shift+Enter for newline
$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── Mode selection ────────────────────────────────────────
// Period button selection
const $customRange = document.getElementById('custom-date-range');
const $dateFrom = document.getElementById('date-from');
const $dateTo = document.getElementById('date-to');

// Default date-to to today, date-from to 2 weeks ago
const today = new Date();
const twoWeeksAgo = new Date(today);
twoWeeksAgo.setDate(today.getDate() - 14);
$dateTo.value = today.toISOString().split('T')[0];
$dateFrom.value = twoWeeksAgo.toISOString().split('T')[0];

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;

    if (btn.dataset.period === 'custom') {
      $customRange.classList.remove('hidden');
    } else {
      $customRange.classList.add('hidden');
    }
  });
});

function startFull() {
  currentMode = 'full';
  let period = currentPeriod;
  if (period === 'custom') {
    const from = $dateFrom.value;
    const to = $dateTo.value;
    if (!from || !to) { alert('Please select both dates.'); return; }
    period = `from ${from} to ${to}`;
  }
  $sessionBadge.textContent = 'Full Session';
  switchToChat();
  ws.send(JSON.stringify({ action: 'chat', text: `full ${period}` }));
}

function startMicro() {
  currentMode = 'micro';
  $sessionBadge.textContent = 'Micro Check';
  switchToChat();
  ws.send(JSON.stringify({ action: 'chat', text: 'micro' }));
}

function startDemo() {
  currentMode = 'demo';
  $sessionBadge.textContent = 'Demo Session';
  switchToChat();
  ws.send(JSON.stringify({ action: 'chat-demo', text: 'full 2 weeks' }));
}

function resumeSession() {
  const history = window._pendingHistory;
  if (history && history.length > 0) {
    // Determine mode from first message
    const first = history[0];
    if (first.content.startsWith('micro')) {
      currentMode = 'micro';
      $sessionBadge.textContent = 'Micro Check';
    } else {
      currentMode = 'full';
      $sessionBadge.textContent = 'Full Session';
    }
    switchToChat();
    // Render history
    history.forEach(m => addMessage(m.role, m.content));
  }
}

function switchToChat() {
  $welcome.classList.add('hidden');
  $chat.classList.remove('hidden');
  $input.focus();
}

function goBack() {
  if (isGenerating) {
    if (!confirm('A session is in progress. Go back anyway?')) return;
    ws.send(JSON.stringify({ action: 'chat-stop' }));
  }
  $chat.classList.add('hidden');
  $welcome.classList.remove('hidden');
}

function clearSession() {
  if (isGenerating) {
    ws.send(JSON.stringify({ action: 'chat-stop' }));
  }
  if (!confirm('Clear session history and context? This cannot be undone.')) return;
  ws.send(JSON.stringify({ action: 'new-session' }));
  $messages.innerHTML = '';
  currentOutput = '';
  currentBubble = null;
  thinkingText = '';
  removeThinkingBubble();
  isGenerating = false;
  updateInputState();
  $headerStatus.textContent = 'Session cleared';
  setTimeout(() => { $headerStatus.textContent = ''; }, 3000);
}

function newSession() {
  if (isGenerating) {
    ws.send(JSON.stringify({ action: 'chat-stop' }));
  }
  ws.send(JSON.stringify({ action: 'new-session' }));
  $messages.innerHTML = '';
  currentOutput = '';
  currentBubble = null;
  thinkingText = '';
  removeThinkingBubble();
  isGenerating = false;
  updateInputState();
  $chat.classList.add('hidden');
  $welcome.classList.remove('hidden');
  $resumeBtn.classList.add('hidden');
}

// Expose for onclick handlers
window.startFull = startFull;
window.startMicro = startMicro;
window.startDemo = startDemo;
window.resumeSession = resumeSession;
window.goBack = goBack;
function clearFromWelcome() {
  if (!confirm('Clear all session history and context? This cannot be undone.')) return;
  ws.send(JSON.stringify({ action: 'new-session' }));
  $resumeBtn.classList.add('hidden');
}

window.clearFromWelcome = clearFromWelcome;
window.clearSession = clearSession;
window.newSession = newSession;
window.sendMessage = sendMessage;
window.stopGeneration = stopGeneration;

// ── Init ──────────────────────────────────────────────────
marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

connect();
