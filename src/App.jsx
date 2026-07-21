import React, { useState } from 'react';
import { AppProvider, useApp } from './AppContext';
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
  const Active = TABS[tab];

  return (
    <div className="app-bg flex h-full flex-col">
      <StarField />
      <Header onOpenSettings={() => setTab('settings')} />
      <main className="flex-1 overflow-y-auto px-4 pb-2 pt-1">
        {/* key remounts the tab so its entrance animation replays */}
        <div key={tab} className="animate-slide-up">
          <Active />
        </div>
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
