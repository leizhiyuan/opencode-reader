const DEFAULT_PORT = 19877;

let opencodeUrl = `http://localhost:${DEFAULT_PORT}`;

async function getOpenCodeUrl() {
  const { opencodePort } = await chrome.storage.local.get("opencodePort");
  const port = opencodePort || DEFAULT_PORT;
  opencodeUrl = `http://localhost:${port}`;
  return opencodeUrl;
}

// reload URL when settings change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.opencodePort) {
    const port = changes.opencodePort.newValue || DEFAULT_PORT;
    opencodeUrl = `http://localhost:${port}`;
  }
});

// init on startup
getOpenCodeUrl();

// tabId → { sessionId, initialized, url }
const tabSessions = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "oc-explain",
    title: 'AI 解释「%s」',
    contexts: ["selection"],
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabSessions.delete(tabId);
});

async function getOrCreateSession(tabId, tabTitle, tabUrl) {
  const existing = tabSessions.get(tabId);
  if (existing) return existing;

  const url = await getOpenCodeUrl();
  const res = await fetch(`${url}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: tabTitle || `Tab ${tabId}` }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();

  const entry = { sessionId: data.id, initialized: false, url: tabUrl };
  tabSessions.set(tabId, entry);

  initSession(entry);

  return entry;
}

function initSession(entry) {
  if (entry.initialized || !entry.url) return;
  entry.initialized = true;

  const initPrompt = `You are a reading companion helping the user deeply understand a technical article. The user is reading:
${entry.url}

Please use the WebFetch tool to fetch and read the full article from the URL above.

From now on, the user will select words, phrases, or sentences from this article. Your job is NOT to simply translate or define — instead, help the user truly understand what the selected content means in the context of this article.

When the user selects something, explain:
- What it refers to in this specific context — the concept, mechanism, or idea behind it
- Why it matters here — how it connects to the article's argument or technical point
- Background knowledge the user might need to fully grasp it (if any)

Use 中文 to explain. Be concise but insightful — like a knowledgeable friend reading alongside.

For general questions: answer based on the article content.

Say "已阅读，请选词" when ready.`;

  fetch(`${opencodeUrl}/session/${entry.sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text: initPrompt }],
    }),
  }).catch((e) => console.error("initSession failed:", e));
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "oc-explain") return;

  await chrome.sidePanel.open({ tabId: tab.id });

  let context = info.selectionText;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "getContext",
    });
    if (response?.context) context = response.context;
  } catch (e) {
    console.warn("Failed to get context from content script:", e);
  }

  let entry;
  try {
    entry = await getOrCreateSession(tab.id, tab.title, tab.url);
  } catch (e) {
    console.error("Failed to create opencode session:", e);
  }

  const payload = {
    type: "explain",
    word: info.selectionText,
    context,
    sessionId: entry?.sessionId,
    tabId: tab.id,
  };

  let retries = 10;
  const trySend = () => {
    chrome.runtime.sendMessage(payload).catch(() => {
      if (--retries > 0) setTimeout(trySend, 200);
    });
  };
  setTimeout(trySend, 300);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getSession") {
    const entry = tabSessions.get(msg.tabId);
    sendResponse({ sessionId: entry?.sessionId || null });
  }

  if (msg.type === "createSession") {
    getOrCreateSession(msg.tabId, msg.tabTitle, msg.tabUrl)
      .then((entry) => sendResponse({ sessionId: entry.sessionId }))
      .catch(() => sendResponse({ sessionId: null }));
    return true;
  }

  if (msg.type === "getOpenCodeUrl") {
    getOpenCodeUrl().then((url) => sendResponse({ url }));
    return true;
  }
});
