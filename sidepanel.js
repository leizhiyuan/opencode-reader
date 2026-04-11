const DEFAULT_PORT = 19877;
let OPENCODE_URL = `http://localhost:${DEFAULT_PORT}`;
let currentPort = DEFAULT_PORT;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const portInput = document.getElementById("port-input");
const savePortBtn = document.getElementById("save-port-btn");
const startCmd = document.getElementById("start-cmd");

let sessionId = null;
let busy = false;
let eventSource = null;
let pendingResolve = null;
let connected = false;
let healthTimer = null;

// --- settings ---

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("open");
});

savePortBtn.addEventListener("click", async () => {
  const port = parseInt(portInput.value, 10);
  if (!port || port < 1 || port > 65535) return;

  await chrome.storage.local.set({ opencodePort: port });
  applyPort(port);
  settingsPanel.classList.remove("open");
});

async function loadPort() {
  const { opencodePort } = await chrome.storage.local.get("opencodePort");
  const port = opencodePort || DEFAULT_PORT;
  portInput.value = port;
  applyPort(port);
}

function applyPort(port) {
  currentPort = port;
  OPENCODE_URL = `http://localhost:${port}`;
  portInput.value = port;
  startCmd.textContent = `opencode serve --port ${port}`;

  // reconnect SSE
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (sessionId) connectSSE();

  checkHealth();
}

// --- health check ---

async function checkHealth() {
  try {
    const res = await fetch(`${OPENCODE_URL}/global/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    setConnected(data.healthy === true, data.version);
  } catch {
    setConnected(false);
  }
}

function setConnected(isConnected, version) {
  connected = isConnected;
  statusDot.className = `status-dot${isConnected ? " connected" : ""}`;
  if (isConnected) {
    statusText.textContent = `已连接${version ? ` (v${version})` : ""}`;
  } else {
    statusText.innerHTML = `未连接 — 请运行 <code style="font-size:11px;background:#f3f4f6;padding:1px 4px;border-radius:3px">opencode serve --port ${currentPort}</code>`;
  }
}

function startHealthCheck() {
  checkHealth();
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(checkHealth, 5000);
}

// --- SSE ---

function connectSSE() {
  if (eventSource) return;
  eventSource = new EventSource(`${OPENCODE_URL}/global/event`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      const payload = event.payload;
      if (!payload || payload.properties?.sessionID !== sessionId) return;

      if (payload.type === "message.updated") {
        const info = payload.properties.info;
        if (info?.role === "assistant" && !info.time?.completed) {
          currentAssistantMsgId = info.id;
        }
        if (info?.role === "assistant" && info.time?.completed) {
          handleAssistantDone(info);
        }
      }

      if (payload.type === "message.part.updated") {
        const part = payload.properties.part;
        if (
          part?.type === "text" &&
          part.messageID &&
          part.messageID === currentAssistantMsgId
        ) {
          handleAssistantText(part);
        }
      }
    } catch {
      // ignore
    }
  };

  eventSource.onerror = () => {
    setConnected(false);
  };
}

const assistantTexts = new Map();
let currentAssistantEl = null;
let currentAssistantMsgId = null;

function handleAssistantText(part) {
  if (!currentAssistantEl) return;

  const contentEl = currentAssistantEl.querySelector(".content");
  const loading = contentEl.querySelector(".loading");
  if (loading) loading.remove();

  assistantTexts.set(part.messageID, part.text);
  contentEl.textContent = part.text;
  scrollToBottom();
}

function handleAssistantDone() {
  busy = false;
  sendBtn.disabled = false;
  currentAssistantMsgId = null;

  if (pendingResolve) {
    pendingResolve();
    pendingResolve = null;
  }
}

// --- messages from background ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "explain") {
    sessionId = msg.sessionId;
    connectSSE();
    explainSelection(msg.sessionId, msg.word, msg.context);
  }
});

// --- input ---

sendBtn.addEventListener("click", sendUserMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendUserMessage();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

async function ensureSession() {
  if (sessionId) return sessionId;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;

  const res = await chrome.runtime.sendMessage({
    type: "getSession",
    tabId: tab.id,
  });
  if (res?.sessionId) {
    sessionId = res.sessionId;
    connectSSE();
    return sessionId;
  }

  const createRes = await chrome.runtime.sendMessage({
    type: "createSession",
    tabId: tab.id,
    tabTitle: tab.title,
    tabUrl: tab.url,
  });
  if (createRes?.sessionId) {
    sessionId = createRes.sessionId;
    connectSSE();
  }
  return sessionId;
}

async function sendUserMessage() {
  const text = inputEl.value.trim();
  if (!text || busy) return;

  const sid = await ensureSession();
  if (!sid) {
    appendError(new Error("无法获取 session，请先右键选词或刷新页面"));
    return;
  }

  inputEl.value = "";
  inputEl.style.height = "auto";

  appendMessage("user", text);
  await sendAndWait(sid, text);
}

async function explainSelection(sid, word, context) {
  const prompt = `我选中了: "${word}"

所在段落:
${context}

帮我理解这个在文章里具体指什么。`;

  appendMessage("user", `🔍 ${word}`);
  await sendAndWait(sid, prompt);
}

async function sendAndWait(sid, text) {
  busy = true;
  sendBtn.disabled = true;

  currentAssistantEl = appendMessage("assistant", null);
  currentAssistantEl.querySelector(".content").innerHTML =
    '<span class="loading">思考中…</span>';
  currentAssistantMsgId = null;

  fetch(`${OPENCODE_URL}/session/${sid}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text }],
    }),
  }).catch(() => {});

  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

// --- DOM helpers ---

function appendMessage(role, text) {
  removeEmpty();
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = `
    <div class="label">${role === "user" ? "You" : "Assistant"}</div>
    <div class="content">${text ? escapeHtml(text) : ""}</div>
  `;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function appendError(e) {
  const el = document.createElement("div");
  el.className = "error";
  el.style.margin = "16px";
  el.textContent = e.message.includes("fetch")
    ? `无法连接 OpenCode。请运行: opencode serve --port ${currentPort}`
    : e.message;
  messagesEl.appendChild(el);
}

function removeEmpty() {
  const empty = messagesEl.querySelector(".empty");
  if (empty) empty.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(s) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

// --- init ---

loadPort();
startHealthCheck();
