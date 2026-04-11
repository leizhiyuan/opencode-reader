const OPENCODE_URL = "http://localhost:19877";
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

let sessionId = null;
let busy = false;
let eventSource = null;
let pendingResolve = null;

function connectSSE() {
  if (eventSource) return;
  eventSource = new EventSource(`${OPENCODE_URL}/global/event`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      const payload = event.payload;
      if (!payload || payload.properties?.sessionID !== sessionId) return;

      // track assistant message ID from message.updated
      if (payload.type === "message.updated") {
        const info = payload.properties.info;
        if (info?.role === "assistant" && !info.time?.completed) {
          currentAssistantMsgId = info.id;
        }
        if (info?.role === "assistant" && info.time?.completed) {
          handleAssistantDone(info);
        }
      }

      // only show text parts that belong to the assistant message
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
    } catch (err) {
      // ignore parse errors
    }
  };
}

const assistantTexts = new Map(); // messageID → accumulated text
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

function handleAssistantDone(info) {
  busy = false;
  sendBtn.disabled = false;
  currentAssistantMsgId = null;

  if (pendingResolve) {
    pendingResolve();
    pendingResolve = null;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "explain") {
    sessionId = msg.sessionId;
    connectSSE();
    explainSelection(msg.sessionId, msg.word, msg.context);
  }
});

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
  const prompt = `解释我选中的内容: "${word}"

所在段落上下文:
${context}`;

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

  // fire and forget - response comes via SSE
  fetch(`${OPENCODE_URL}/session/${sid}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text }],
    }),
  }).catch(() => {});

  // wait for assistant done event
  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

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

function appendStatus(text) {
  removeEmpty();
  const el = document.createElement("div");
  el.className = "status";
  el.innerHTML = `<span class="loading">${escapeHtml(text)}</span>`;
  messagesEl.appendChild(el);
}

function appendError(e) {
  const el = document.createElement("div");
  el.className = "error";
  el.style.margin = "16px";
  el.textContent = e.message.includes("fetch")
    ? "无法连接 OpenCode。请确认已运行: opencode serve --port 19877"
    : e.message;
  messagesEl.appendChild(el);
}

function clearMessages() {
  messagesEl.innerHTML = "";
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
