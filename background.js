const OPENCODE_URL = "http://localhost:19877";

// tabId → { sessionId, initialized, url }
const tabSessions = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "oc-explain",
    title: 'AI 解释「%s」',
    contexts: ["selection"],
  });

  // click extension icon to open side panel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabSessions.delete(tabId);
});

async function getOrCreateSession(tabId, tabTitle, tabUrl) {
  const existing = tabSessions.get(tabId);
  if (existing) return existing;

  const res = await fetch(`${OPENCODE_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: tabTitle || `Tab ${tabId}` }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();

  const entry = { sessionId: data.id, initialized: false, url: tabUrl };
  tabSessions.set(tabId, entry);

  // auto initialize: tell AI about the article
  initSession(entry);

  return entry;
}

function initSession(entry) {
  if (entry.initialized || !entry.url) return;
  entry.initialized = true;

  const initPrompt = `You are a reading assistant. The user is reading this article:
${entry.url}

Please use the WebFetch tool to fetch and read the full article from the URL above.
From now on, the user will select words or sentences from this article, or ask questions about it.

For word/phrase explanations:
1. Meaning in this article's context (用中英文双语)
2. If English: pronunciation, common collocations
3. Why the author used this word/phrase here
4. An example sentence

For general questions: answer based on the article content.

Keep explanations concise but insightful. Say "已阅读，请选词" when done.`;

  // fire and forget - don't block
  fetch(`${OPENCODE_URL}/session/${entry.sessionId}/message`, {
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
});
