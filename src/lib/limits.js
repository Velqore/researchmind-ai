// Free-tier daily CREDIT engine backed by chrome.storage.local.
// One shared pool of credits per day; every feature spends from it by its
// CREDIT_COST. Resets at LOCAL midnight (usage stamped with the local date key).

import { CREDIT_COST, FREE_DAILY_CREDITS } from '../config';
import { KEYS, storageGet, storageSet } from './storage';

export function todayKey() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const costOf = (feature) => CREDIT_COST[feature] ?? 1;

function freshUsage() {
  return { date: todayKey(), spent: 0 };
}

/** Read usage, resetting the pool if the local date rolled over. */
export async function getUsage() {
  const stored = await storageGet(KEYS.USAGE);
  if (!stored || stored.date !== todayKey() || typeof stored.spent !== 'number') {
    const reset = freshUsage();
    await storageSet(KEYS.USAGE, reset);
    return reset;
  }
  return stored;
}

/** Credits left in today's pool. */
export function creditsLeft(usage) {
  return Math.max(0, FREE_DAILY_CREDITS - (usage?.spent ?? 0));
}

/** How many more times a given feature is affordable right now. */
export function remaining(usage, feature) {
  return Math.floor(creditsLeft(usage) / costOf(feature));
}

/**
 * Spend credits for one use of a feature. Returns the updated usage object, or
 * null if there aren't enough credits left (callers then show the upgrade
 * prompt). Pro users never spend — call sites skip this when isPro is true.
 */
export async function consume(feature) {
  const usage = await getUsage();
  const cost = costOf(feature);
  if (creditsLeft(usage) < cost) return null;
  const updated = { ...usage, spent: (usage.spent ?? 0) + cost };
  await storageSet(KEYS.USAGE, updated);
  return updated;
}

/** Milliseconds until the next LOCAL midnight (when credits reset). */
export function msUntilMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
