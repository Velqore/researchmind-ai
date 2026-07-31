import React, { useState } from 'react';
import { AppProvider, useApp } from './AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import StarField from './components/StarField';
import TabBar from './components/TabBar';
import UpgradeModal from './components/UpgradeModal';
import HomeTab from './components/tabs/HomeTab';
import ResearchTab from './components/tabs/ResearchTab';
import WriterTab from './components/tabs/WriterTab';
import LibraryTab from './components/tabs/LibraryTab';
import SettingsTab from './components/tabs/SettingsTab';

const TABS = {
  home: HomeTab,
  research: ResearchTab,
  writer: WriterTab,
  library: LibraryTab,
  settings: SettingsTab,
};

function Shell() {
  const [tab, setTab] = useState('home');
  const { upgradeOpen, closeUpgrade } = useApp();

  return (
    <div className="app-bg flex h-full flex-col">
      <StarField />
      <Header onOpenSettings={() => setTab('settings')} />
      <main className="flex-1 overflow-y-auto px-4 pb-2 pt-1">
        {/* Every tab stays mounted and inactive ones are hidden, so search
            results, summaries and writer output survive tab switches. */}
        {Object.entries(TABS).map(([id, Tab]) => (
          <div key={id} className={id === tab ? 'animate-slide-up' : 'hidden'}>
            <ErrorBoundary>
              <Tab />
            </ErrorBoundary>
          </div>
        ))}
      </main>
      <TabBar active={tab} onChange={setTab} />
      {upgradeOpen && <UpgradeModal onClose={closeUpgrade} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
