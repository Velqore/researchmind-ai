import React, { lazy, Suspense, useEffect, useState } from 'react';
import { AppProvider, useApp } from './AppContext';
import { trackVisit } from './lib/api';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import Nav from './components/Nav';
import StarField from './components/StarField';
import UpgradeModal from './components/UpgradeModal';
import { SkeletonCard } from './components/Skeleton';
import { useRoute } from './router';

// Each page is lazy-loaded: its code (and heavy deps) download only when the
// route is first visited — so a free user never downloads the Pro-tool code,
// and the initial load stays light.
const HomePage = lazy(() => import('./components/tabs/HomeTab'));
const ResearchPage = lazy(() => import('./components/tabs/ResearchTab'));
const WriterPage = lazy(() => import('./components/tabs/WriterTab'));
const LibraryPage = lazy(() => import('./components/tabs/LibraryTab'));
const SettingsPage = lazy(() => import('./components/tabs/SettingsTab'));

const ROUTE_COMPONENTS = {
  '/': HomePage,
  '/research': ResearchPage,
  '/writer': WriterPage,
  '/library': LibraryPage,
  '/settings': SettingsPage,
};

function matchRoute(path) {
  if (ROUTE_COMPONENTS[path]) return ROUTE_COMPONENTS[path];
  // Longest-prefix match so nested paths (e.g. /research/gaps) still resolve.
  const key = Object.keys(ROUTE_COMPONENTS)
    .filter((r) => r !== '/' && path.startsWith(r))
    .sort((a, b) => b.length - a.length)[0];
  return key ? ROUTE_COMPONENTS[key] : HomePage;
}

/** Mobile nav drawer. Uses a state-driven Tailwind transition (mounts once,
 *  animates in on the next frame, holds its open state) rather than a CSS
 *  keyframe — keyframes here reverted/restarted, causing the flashing. `!fixed`
 *  overrides the global `.app-bg > *` position:relative rule that would
 *  otherwise drop this overlay into the layout flow on the right. */
function MobileDrawer({ onClose }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // rAF gives a smooth slide when visible; the setTimeout is a fallback so the
    // drawer still opens if rAF is paused (backgrounded/non-compositing tab).
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => setShown(true), 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="!fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute left-0 top-0 h-full border-r border-white/10 bg-ink-950/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out ${
          shown ? 'translate-x-0' : '-translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <Nav variant="drawer" onNavigate={onClose} />
      </div>
    </div>
  );
}

function Shell() {
  const path = useRoute();
  const { upgradeOpen, closeUpgrade } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const Page = matchRoute(path);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  return (
    <div className="app-bg flex h-full">
      <StarField />
      <Nav variant="side" />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 pb-4 pt-1 md:px-8">
          <div className="mx-auto w-full max-w-[720px]">
            <ErrorBoundary key={path}>
              <Suspense fallback={<div className="py-3"><SkeletonCard /></div>}>
                <Page />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Mobile slide-in drawer (replaces the bottom bar) */}
      {menuOpen && <MobileDrawer onClose={() => setMenuOpen(false)} />}

      {upgradeOpen && <UpgradeModal onClose={closeUpgrade} />}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    trackVisit();
  }, []);

  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
