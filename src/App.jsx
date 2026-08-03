import React, { lazy, Suspense, useEffect } from 'react';
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

function Shell() {
  const path = useRoute();
  const { upgradeOpen, closeUpgrade } = useApp();
  const Page = matchRoute(path);

  return (
    <div className="app-bg flex h-full">
      <StarField />
      <Nav variant="side" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto px-4 pb-2 pt-1">
          <div className="mx-auto w-full max-w-[680px]">
            <ErrorBoundary key={path}>
              <Suspense fallback={<div className="py-3"><SkeletonCard /></div>}>
                <Page />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <Nav variant="bottom" />
      </div>
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
