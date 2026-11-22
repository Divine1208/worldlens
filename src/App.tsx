import { useApp } from './store/AppContext';
import { Header } from './components/Header';
import { Feed } from './views/Feed';
import { StoryReader } from './views/StoryReader';
import { MarketGaps } from './views/MarketGaps';
import { Opportunities } from './views/Opportunities';
import { Knowledge, Saved } from './views/Knowledge';
import { SideDrawer } from './components/SideDrawer';
import { HealthModal, VaultModal } from './components/Modals';
import { BRAND } from './config';

export default function App() {
  const { view } = useApp();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      <main className="mx-auto max-w-[1400px] px-3 py-5 sm:px-5">
        {view.name === 'today' && <Feed />}
        {view.name === 'category' && <Feed category={view.cat} />}
        {view.name === 'story' && <StoryReader id={view.id} />}
        {view.name === 'gaps' && <MarketGaps />}
        {view.name === 'opps' && <Opportunities />}
        {view.name === 'saved' && <Saved />}
        {view.name === 'knowledge' && <Knowledge />}
      </main>
      <footer className="mx-auto max-w-[1400px] px-5 pb-8 text-center text-[11px] text-slate-500">
        {BRAND.name} shows only items with validated timestamps from named sources. Politically neutral: it informs, never tells you how to vote.
      </footer>
      <SideDrawer />
      <HealthModal />
      <VaultModal />
    </div>
  );
}
