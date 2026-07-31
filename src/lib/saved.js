// Locally saved summaries — the "My Library" store. Every completed summary is
// auto-saved here so the app becomes a workspace the user returns to, not a
// one-shot tool. Backed by chrome.storage.local (extension) or localStorage
// (web), same as highlights.

import { KEYS, storageGet, storageSet } from './storage';

const MAX_ITEMS = 200; // keep the store bounded

// The Library tab stays mounted (tabs don't remount), so it can't rely on a
// mount-time read to see newly saved items. Broadcast a same-document event it
// can subscribe to — works in both the web app and the extension popup.
export const SAVED_EVENT = 'rm-saved-changed';
function notifySaved() {
  try {
    window.dispatchEvent(new CustomEvent(SAVED_EVENT));
  } catch {
    /* no window (SSR / worker) — ignore */
  }
}

export async function getSaved() {
  return (await storageGet(KEYS.SAVED)) ?? [];
}

/** Auto-save a summary. De-duplicates on (url + length): re-summarizing the
 *  same source at the same depth updates the existing entry instead of piling
 *  up copies. Returns the updated list. */
export async function saveSummary({ title, summary, url = '', length = 'medium', source = '' }) {
  if (!summary || summary.trim().length < 20) return await getSaved();
  const items = await getSaved();
  const dedupeKey = `${url}::${length}`;
  const without = items.filter((it) => `${it.url}::${it.length}` !== dedupeKey || !url);
  const entry = {
    id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: (title || 'Summary').slice(0, 300),
    summary: summary.slice(0, 12000),
    url,
    length,
    // A slice of source text lets "chat with this paper" work when re-opened.
    source: (source || '').slice(0, 45000),
    createdAt: new Date().toISOString(),
  };
  const updated = [entry, ...without].slice(0, MAX_ITEMS);
  await storageSet(KEYS.SAVED, updated);
  notifySaved();
  return updated;
}

export async function removeSaved(id) {
  const items = await getSaved();
  const updated = items.filter((it) => it.id !== id);
  await storageSet(KEYS.SAVED, updated);
  notifySaved();
  return updated;
}

export async function clearSaved() {
  await storageSet(KEYS.SAVED, []);
  notifySaved();
  return [];
}
