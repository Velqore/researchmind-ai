// ResearchMind AI — content script
// Extracts readable page text and tracks the user's current text selection.
// Guarded against double-injection (declared in manifest AND injectable on
// demand from the popup for pages loaded before the extension was installed).
(() => {
  if (window.__researchmindInjected) return;
  window.__researchmindInjected = true;

  let lastSelection = '';

  document.addEventListener('selectionchange', () => {
    const text = window.getSelection?.().toString().trim();
    if (text) lastSelection = text;
  });

  const NOISE_SELECTOR =
    'script,style,noscript,svg,canvas,iframe,nav,footer,header,aside,form,button,[role="navigation"],[role="banner"],[aria-hidden="true"]';

  function extractPageText() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());
    const text = (clone.innerText || '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // Cap payload — plenty for a summary, keeps requests fast.
    return text.slice(0, 60000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_TEXT') {
      sendResponse({
        ok: true,
        title: document.title,
        url: location.href,
        text: extractPageText(),
      });
      return true;
    }
    if (message?.type === 'GET_SELECTION') {
      const current = window.getSelection?.().toString().trim();
      sendResponse({ ok: true, selection: current || lastSelection });
      return true;
    }
    return false;
  });
})();
