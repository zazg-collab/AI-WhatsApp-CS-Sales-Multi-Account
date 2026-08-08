/**
 * Sentinel Test Harness v2 — Web Chat Simulator
 * 
 * JavaScript client untuk Test Harness REST API.
 * Port-safe: API di http://localhost:3001/api/v1/test-harness
 * 
 * Features:
 * - Multi-session tabs
 * - Send messages & get AI replies (MOCK for Fase 1)
 * - Load predefined scenarios
 * - Debug panel dengan funnel state, kota, ongkir, tokens, gate warnings
 * 
 * Created: 2026-08-08
 */

// UI di-serve dari NestJS yang sama (port 3001), gunakan relative URL — no CORS needed.
const API_BASE = '/api/v1/test-harness';

// Model options per provider
const PROVIDER_MODELS = {
  mock: ['mock-v1'],
  anthropic: ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'],
  openrouter: [
    'meta-llama/llama-3.3-70b-instruct',   // ← Sentinel default
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-4.5-turbo',
    'google/gemini-2.0-flash-exp',
    'deepseek/deepseek-r1',
  ],
};

// State
let currentSession = null;
let sessions = [];

// DOM Elements
const sessionTabs = document.getElementById('sessionTabs');
const sessionInfo = document.getElementById('sessionInfo');
const sessionName = document.getElementById('sessionName');
const providerSelect = document.getElementById('providerSelect');
const modelSelect = document.getElementById('modelSelect');
const switchProviderBtn = document.getElementById('switchProviderBtn');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const scenarioBtn = document.getElementById('scenarioBtn');
const scenarioModal = document.getElementById('scenarioModal');
const scenarioList = document.getElementById('scenarioList');
const closeModalBtn = document.getElementById('closeModalBtn');

// Debug panel elements
const debugFunnel = document.getElementById('debugFunnel');
const debugStatus = document.getElementById('debugStatus');
const debugKota = document.getElementById('debugKota');
const debugOngkir = document.getElementById('debugOngkir');
const debugItems = document.getElementById('debugItems');
const debugTokens = document.getElementById('debugTokens');
const debugGate = document.getElementById('debugGate');
const debugTools = document.getElementById('debugTools');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSessions();
  
  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) {
      sendMessage();
    }
  });
  
  scenarioBtn.addEventListener('click', () => {
    scenarioModal.classList.remove('hidden');
  });
  
  closeModalBtn.addEventListener('click', () => {
    scenarioModal.classList.add('hidden');
  });
  
  // Scenario selection
  scenarioList.addEventListener('click', async (e) => {
    const item = e.target.closest('.scenario-item');
    if (!item || !currentSession) return;
    
    const scenarioName = item.dataset.scenario;
    await loadScenario(scenarioName);
    scenarioModal.classList.add('hidden');
  });
  
  // New session button
  sessionTabs.addEventListener('click', async (e) => {
    if (e.target.classList.contains('tab-btn') && e.target.dataset.session === 'new') {
      await createSession();
    } else if (e.target.classList.contains('tab-btn')) {
      const sessionId = e.target.dataset.session;
      await switchSession(sessionId);
    }
  });

  // Provider switcher — update model list when provider changes
  providerSelect.addEventListener('change', () => {
    const models = PROVIDER_MODELS[providerSelect.value] || ['mock-v1'];
    modelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
  });

  switchProviderBtn.addEventListener('click', async () => {
    if (!currentSession) return;
    const provider = providerSelect.value;
    const model = modelSelect.value;
    await switchProvider(provider, model);
  });

  const clearSessionBtn = document.getElementById('clearSessionBtn');
  clearSessionBtn.addEventListener('click', async () => {
    if (!currentSession) return;
    if (confirm('Yakin ingin menghapus sesi ini beserta semua riwayat percakapannya?')) {
      await deleteSession(currentSession.id);
    }
  });
});

// API Calls
async function deleteSession(sessionId) {
  try {
    const clearBtn = document.getElementById('clearSessionBtn');
    clearBtn.disabled = true;
    const span = clearBtn.querySelector('span');
    if (span) span.textContent = 'Deleting...';
    
    await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    
    currentSession = null;
    await loadSessions();
    if (sessions.length === 0) {
      renderMessages();
      updateSessionInfo();
      disableInput();
    }
  } catch (error) {
    alert('Gagal menghapus sesi: ' + error.message);
  }
}

async function createSession() {
  const name = `Session ${sessions.length + 1}`;
  
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Default: pakai model yang sama dengan Sentinel production
    body: JSON.stringify({ name, provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' }),
  });
  
  const data = await response.json();
  sessions.push(data.session);
  
  renderSessionTabs();
  await switchSession(data.session.id);
}

async function switchProvider(provider, model) {
  if (!currentSession) return;
  switchProviderBtn.disabled = true;
  switchProviderBtn.textContent = '...';
  try {
    await fetch(`${API_BASE}/sessions/${currentSession.id}/provider`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    });
    currentSession.provider = provider;
    currentSession.model = model;
    updateSessionInfo();
    const note = document.createElement('div');
    note.className = 'message system';
    note.innerHTML = `<div class="message-content">🔄 Switched to <strong>${provider} / ${model}</strong></div>`;
    messages.appendChild(note);
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    alert('Failed to switch provider: ' + err.message);
  } finally {
    switchProviderBtn.disabled = false;
    switchProviderBtn.textContent = 'Switch';
  }
}

async function loadSessions() {
  const response = await fetch(`${API_BASE}/sessions`);
  const data = await response.json();
  sessions = data.sessions || [];
  
  renderSessionTabs();
  
  if (sessions.length > 0) {
    await switchSession(sessions[0].id);
  }
}

async function switchSession(sessionId) {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
  const data = await response.json();
  
  currentSession = data.session;
  
  renderSessionTabs();
  renderMessages();
  updateSessionInfo();
  enableInput();
  updateDebugPanel();
}

async function sendMessage() {
  if (!currentSession || !messageInput.value.trim()) return;
  
  const text = messageInput.value.trim();
  messageInput.value = '';
  
  // Optimistic UI update
  const tempUserId = 'temp-' + Date.now();
  currentSession.messages.push({
    id: tempUserId,
    role: 'user',
    content: text,
    timestamp: new Date().toISOString()
  });
  
  currentSession.messages.push({
    id: 'loading',
    role: 'assistant',
    content: '<div class="typing-indicator"><span>.</span><span>.</span><span>.</span></div>',
    timestamp: new Date().toISOString()
  });
  
  renderMessages();
  disableInput();
  
  try {
    const response = await fetch(`${API_BASE}/sessions/${currentSession.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Remove temp messages
    currentSession.messages = currentSession.messages.filter(m => m.id !== tempUserId && m.id !== 'loading');
    
    // Add real messages
    currentSession.messages.push(data.message);
    currentSession.messages.push(data.reply);
    
    renderMessages();
    updateDebugPanel(data.reply.debugInfo);
  } catch (error) {
    console.error('Send message error:', error);
    
    // Remove loading indicator on error
    currentSession.messages = currentSession.messages.filter(m => m.id !== 'loading');
    currentSession.messages.push({
      id: 'error-' + Date.now(),
      role: 'system',
      content: 'Error: Failed to send message (Timeout or Network Error). Please try again.',
      timestamp: new Date().toISOString()
    });
    renderMessages();
  } finally {
    enableInput();
    messageInput.focus();
  }
}

async function loadScenario(scenarioName) {
  if (!currentSession) return;
  
  disableInput();
  
  try {
    const response = await fetch(`${API_BASE}/sessions/${currentSession.id}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioName }),
    });
    
    await response.json();
    
    // Reload session to get new messages
    await switchSession(currentSession.id);
  } catch (error) {
    console.error('Load scenario error:', error);
    alert('Failed to load scenario');
  } finally {
    enableInput();
  }
}

// Rendering
function renderSessionTabs() {
  const tabs = sessions.map(session => {
    const isActive = currentSession && session.id === currentSession.id;
    return `
      <button class="tab-btn ${isActive ? 'active' : ''}" data-session="${session.id}">
        ${session.name}
      </button>
    `;
  }).join('');
  
  sessionTabs.innerHTML = `
    ${tabs}
    <button class="tab-btn" data-session="new">+ New Session</button>
  `;
}

function renderMessages() {
  if (!currentSession || !currentSession.messages || currentSession.messages.length === 0) {
    messages.innerHTML = `
      <div class="welcome-message">
        <p>👋 Session kosong — ketik pesan untuk mulai testing!</p>
      </div>
    `;
    return;
  }
  
  const html = currentSession.messages.map(msg => {
    const time = new Date(msg.timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
    
    const avatar = msg.role === 'user' ? '👤' : '🤖';
    
    return `
      <div class="message ${msg.role}">
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
          ${msg.content.replace(/\n/g, '<br>')}
          <div class="message-time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
  
  messages.innerHTML = html;
  messages.scrollTop = messages.scrollHeight;
}

function updateSessionInfo() {
  if (!currentSession) {
    sessionName.textContent = 'No session selected';
    providerSelect.disabled = true;
    modelSelect.disabled = true;
    switchProviderBtn.disabled = true;
    return;
  }

  sessionName.textContent = currentSession.name;

  // Sync provider select
  providerSelect.value = currentSession.provider || 'mock';
  providerSelect.disabled = false;

  // Sync model options + selected model
  const models = PROVIDER_MODELS[currentSession.provider] || ['mock-v1'];
  modelSelect.innerHTML = models.map(m =>
    `<option value="${m}" ${m === currentSession.model ? 'selected' : ''}>${m}</option>`
  ).join('');
  modelSelect.disabled = false;
  switchProviderBtn.disabled = false;
}

function updateDebugPanel(debugInfo) {
  if (!debugInfo) {
    // Use last message's debug info if available
    if (currentSession && currentSession.messages && currentSession.messages.length > 0) {
      const lastMsg = currentSession.messages[currentSession.messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.debugInfo) {
        debugInfo = lastMsg.debugInfo;
      }
    }
  }
  
  if (!debugInfo) {
    debugFunnel.textContent = '—';
    debugFunnel.className = 'badge';
    debugStatus.textContent = '—';
    debugKota.textContent = '—';
    debugOngkir.textContent = '—';
    debugItems.innerHTML = '—';
    debugTokens.textContent = '—';
    debugGate.innerHTML = '—';
    return;
  }
  
  // Funnel mode badge
  debugFunnel.textContent = debugInfo.funnelMode || '—';
  debugFunnel.className = `badge ${debugInfo.funnelMode || ''}`;
  
  // Status
  debugStatus.textContent = debugInfo.status || '—';
  
  // Kota tujuan
  debugKota.textContent = debugInfo.kotaTujuan || '—';
  
  // Ongkir
  if (debugInfo.ongkir) {
    debugOngkir.textContent = `Rp${debugInfo.ongkir.amount.toLocaleString('id-ID')} (${debugInfo.ongkir.courier} ${debugInfo.ongkir.service})`;
  } else {
    debugOngkir.textContent = '—';
  }
  
  // Items
  if (debugInfo.items && debugInfo.items.length > 0) {
    debugItems.innerHTML = debugInfo.items.map(item => 
      `<div>${item.name} x${item.qty} — Rp${item.price.toLocaleString('id-ID')}</div>`
    ).join('');
  } else {
    debugItems.innerHTML = '—';
  }
  
  // Tokens
  if (debugInfo.tokens && Object.keys(debugInfo.tokens).length > 0) {
    debugTokens.textContent = JSON.stringify(debugInfo.tokens, null, 2);
  } else {
    debugTokens.textContent = '—';
  }
  
    // Gate warnings
  if (debugInfo.gateWarnings && debugInfo.gateWarnings.length > 0) {
    debugGate.innerHTML = debugInfo.gateWarnings.map(warning => 
      `<div>⚠️ ${warning}</div>`
    ).join('');
  } else {
    debugGate.innerHTML = '—';
  }

  // Tool Calls
  if (debugInfo.toolCalls && debugInfo.toolCalls.length > 0) {
    debugTools.innerHTML = debugInfo.toolCalls.map(t => 
      `<div style="margin-bottom: 8px;">
         <strong style="color: var(--sentinel-teal);">${t.name}</strong><br>
         <span style="color: var(--text-muted); font-size: 11px;">Args:</span><br>
         <div style="font-size: 11px; font-family: monospace; background: var(--bg-surface); padding: 4px; border-radius: 4px;">${JSON.stringify(t.args, null, 2)}</div>
         <span style="color: var(--text-muted); font-size: 11px;">Result:</span><br>
         <div style="font-size: 11px; font-family: monospace; background: var(--bg-surface); padding: 4px; border-radius: 4px; max-height: 100px; overflow-y: auto;">${JSON.stringify(t.result, null, 2)}</div>
       </div>`
    ).join('');
  } else {
    debugTools.innerHTML = '—';
  }
}

function enableInput() {
  messageInput.disabled = false;
  sendBtn.disabled = false;
  scenarioBtn.disabled = false;
  
  const clearBtn = document.getElementById('clearSessionBtn');
  if (clearBtn) clearBtn.disabled = false;
}

function disableInput() {
  messageInput.disabled = true;
  sendBtn.disabled = true;
  scenarioBtn.disabled = true;
  
  const clearBtn = document.getElementById('clearSessionBtn');
  if (clearBtn) clearBtn.disabled = true;
}
