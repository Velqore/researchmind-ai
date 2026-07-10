// License handling — validates keys against the FastAPI backend, which
// checks the hashed key + expiry in Supabase. No demo path: activation is
// real and requires the deployed backend.

import { API_BASE } from '../config';
import { KEYS, storageGet, storageSet } from './storage';

export async function getLicense() {
  const license = await storageGet(KEYS.LICENSE);
  if (!license) return { isPro: false, key: null, expiresAt: null };
  // Expired keys drop back to free tier immediately.
  if (license.isPro && license.expiresAt && Date.now() > new Date(license.expiresAt).getTime()) {
    const expired = { ...license, isPro: false };
    await storageSet(KEYS.LICENSE, expired);
    return expired;
  }
  return license;
}

/** Format: RMND-XXXX-XXXX-XXXX (16 significant characters). */
export function isValidKeyFormat(key) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim().toUpperCase());
}

export function normalizeKey(raw) {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return chars.replace(/(.{4})(?=.)/g, '$1-');
}

/**
 * Validate a key against the backend (/validate-key hits Supabase).
 * Returns { ok, isPro, expiresAt?, error? }.
 */
export async function activateKey(key) {
  if (!isValidKeyFormat(key)) {
    return { ok: false, error: 'That doesn’t look like a valid key. Format: RMND-XXXX-XXXX-XXXX' };
  }

  try {
    const res = await fetch(`${API_BASE}/validate-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key.trim().toUpperCase() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.detail || 'This key is invalid or has expired.' };
    }
    const data = await res.json();
    const license = { isPro: true, key: key.trim().toUpperCase(), expiresAt: data.expires_at };
    await storageSet(KEYS.LICENSE, license);
    return { ok: true, isPro: true, expiresAt: data.expires_at };
  } catch {
    return { ok: false, error: 'Couldn’t reach the server. Check your connection and try again.' };
  }
}

export async function deactivate() {
  await storageSet(KEYS.LICENSE, { isPro: false, key: null, expiresAt: null });
}
