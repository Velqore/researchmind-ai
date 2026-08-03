// Tiny dependency-free hash router. Hash routing works identically in the web
// app and the Chrome extension popup (no server rewrites needed) and keeps the
// bundle lean — part of the "make it lighter" goal.
import { useSyncExternalStore } from 'react';

export function currentPath() {
  const h = window.location.hash.replace(/^#/, '');
  return h && h.startsWith('/') ? h : '/';
}

function subscribe(cb) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

/** Reactive current route path, e.g. "/summarize". */
export function useRoute() {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

/** Navigate to a route. No-op if already there. */
export function navigate(to) {
  if (currentPath() === to) return;
  window.location.hash = to;
  // hashchange doesn't fire if only the leading slash changes; scroll to top.
  window.scrollTo?.(0, 0);
}
