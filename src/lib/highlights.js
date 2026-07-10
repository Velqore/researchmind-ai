// Saved highlights library (free tier: 5 saves/day via the limits engine).

import { KEYS, storageGet, storageSet } from './storage';

export async function getHighlights() {
  return (await storageGet(KEYS.HIGHLIGHTS)) ?? [];
}

export async function addHighlight({ text, url, title }) {
  const highlights = await getHighlights();
  const entry = {
    id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: text.slice(0, 2000),
    url,
    title,
    createdAt: new Date().toISOString(),
  };
  const updated = [entry, ...highlights];
  await storageSet(KEYS.HIGHLIGHTS, updated);
  return updated;
}

export async function removeHighlight(id) {
  const highlights = await getHighlights();
  const updated = highlights.filter((h) => h.id !== id);
  await storageSet(KEYS.HIGHLIGHTS, updated);
  return updated;
}
