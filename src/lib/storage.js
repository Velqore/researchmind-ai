// Thin async storage layer over chrome.storage.local with a localStorage
// fallback, so the popup also runs in a plain browser tab during development
// (`npm run dev`) where the chrome.* APIs don't exist.

export const isExtension =
  typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function storageGet(key) {
  if (isExtension) {
    const data = await chrome.storage.local.get(key);
    return data[key];
  }
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : undefined;
}

export async function storageSet(key, value) {
  if (isExtension) {
    await chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

// Notify listeners when storage changes (keeps popup state in sync if the
// service worker or another surface writes).
export function onStorageChange(callback) {
  if (!isExtension) return () => {};
  const listener = (changes, area) => {
    if (area === 'local') callback(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export const KEYS = {
  USAGE: 'rm_usage',
  LICENSE: 'rm_license',
  HIGHLIGHTS: 'rm_highlights',
};
