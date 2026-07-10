// ResearchMind AI — MV3 service worker
// Responsibilities in Step 1:
//  - initialize default storage on install
//  - periodic local license expiry check (server re-validation lands in Step 6)
//  - lightweight message router shared by popup and content scripts

const STORAGE_KEYS = {
  USAGE: 'rm_usage',
  LICENSE: 'rm_license',
  HIGHLIGHTS: 'rm_highlights',
};

// Local date key (YYYY-MM-DD in the user's timezone) — limits reset at LOCAL midnight.
function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      [STORAGE_KEYS.USAGE]: {
        date: todayKey(),
        counts: { summarize: 0, explain: 0, cite: 0, highlight: 0 },
      },
      [STORAGE_KEYS.LICENSE]: { isPro: false, key: null, expiresAt: null },
      [STORAGE_KEYS.HIGHLIGHTS]: [],
    });
  }
  // Re-check license expiry twice a day.
  chrome.alarms.create('rm-license-check', { periodInMinutes: 720 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'rm-license-check') return;
  const data = await chrome.storage.local.get(STORAGE_KEYS.LICENSE);
  const license = data[STORAGE_KEYS.LICENSE];
  if (license?.isPro && license.expiresAt && Date.now() > new Date(license.expiresAt).getTime()) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LICENSE]: { ...license, isPro: false },
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_LICENSE') {
    chrome.storage.local
      .get(STORAGE_KEYS.LICENSE)
      .then((data) => sendResponse(data[STORAGE_KEYS.LICENSE] ?? { isPro: false }));
    return true; // async response
  }
  return false;
});
