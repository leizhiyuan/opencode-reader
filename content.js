chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "getContext") return;

  const selection = window.getSelection();
  if (!selection.rangeCount) {
    sendResponse({ context: "" });
    return;
  }

  const range = selection.getRangeAt(0);
  let container = range.commonAncestorContainer;
  if (container.nodeType === Node.TEXT_NODE) {
    container = container.parentElement;
  }

  const blockTags = new Set([
    "P", "DIV", "ARTICLE", "SECTION", "LI", "BLOCKQUOTE",
    "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "PRE",
  ]);
  let block = container;
  while (block && !blockTags.has(block.tagName)) {
    block = block.parentElement;
  }

  const contextText = (block || container).innerText || "";
  sendResponse({ context: contextText.slice(0, 2000) });
});
