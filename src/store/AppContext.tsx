import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AdapterHealth, GlobalOpportunity, IngestionLogLine, NewsStory, PipelineStage, RejectedItem, TrackerEntry, UserState, Vault } from '../types';
import { loadPersisted, loadUser, loadVault, saveUser, saveVault, savePersisted } from '../lib/storage';
import { runIngestion } from '../adapters';
import { currentCycle, splitByCycle } from '../lib/lifecycle';
import { msUntilMidnight } from '../lib/time';
import { CURATED_OPPORTUNITIES } from '../data/opportunities';

export type View =
  | { name: 'today' }
  | { name: 'category'; cat: NewsStory['category'] }
  | { name: 'gaps' }
  | { name: 'opps' }
  | { name: 'saved' }
  | { name: 'knowledge' }
  | { name: 'story'; id: string };

export interface Drawer {
  open: boolean;
  tab: 'term' | 'chat';
  term?: string;
  storyId?: string;
  seedQuestion?: string;
}

interface Ctx {
  user: UserState;
  vault: Vault;
  setUser: (fn: (u: UserState) => UserState) => void;
  setVault: (v: Vault) => void;
  now: Date;
  cycle: string;
  stories: NewsStory[];
  todayStories: NewsStory[];
  archive: NewsStory[];
  health: AdapterHealth[];
  rejected: RejectedItem[];
  liveOpps: GlobalOpportunity[];
  allOpps: GlobalOpportunity[];
  lastPolled: string | null;
  polling: boolean;
  log: IngestionLogLine[];
  loaded: boolean;
  poll: () => Promise<void>;
  view: View;
  go: (v: View) => void;
  drawer: Drawer;
  openDrawer: (d: Omit<Drawer, 'open'>) => void;
  closeDrawer: () => void;
  modal: null | 'health' | 'vault';
  setModal: (m: null | 'health' | 'vault') => void;
  search: string;
  setSearch: (s: string) => void;
  /* user actions */
  setRead: (id: string, read: boolean) => void;
  markManyRead: (ids: string[]) => void;
  toggleSaveStory: (id: string) => void;
  toggleSaveOpp: (id: string) => void;
  updateTracker: (id: string, patch: Partial<TrackerEntry>) => void;
  learnConcept: (term: string) => void;
  rolloverNotice: string | null;
}

const AppCtx = createContext<Ctx | null>(null);

export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

function parseHash(): View {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
  if (h.startsWith('story-')) return { name: 'story', id: h.slice(6) };
  if (['india', 'world', 'markets', 'ai-tech', 'startups'].includes(h)) return { name: 'category', cat: h as NewsStory['category'] };
  if (h === 'gaps' || h === 'opps' || h === 'saved' || h === 'knowledge') return { name: h };
  return { name: 'today' };
}
function viewHash(v: View) {
  if (v.name === 'story') return `#story-${v.id}`;
  if (v.name === 'category') return `#${v.cat}`;
  return v.name === 'today' ? '#today' : `#${v.name}`;
}

const blankTracker = (): TrackerEntry => ({ stage: 'Not Started' as PipelineStage, checked: {}, draftUrl: '', notes: '', updatedAt: new Date().toISOString() });

export function AppProvider({ children, autoPoll = true, clock }: { children: ReactNode; autoPoll?: boolean; clock?: () => Date }) {
  const getNow = useCallback(() => (clock ? clock() : new Date()), [clock]);
  const [user, setUserState] = useState<UserState>(() => loadUser());
  const [vault, setVaultState] = useState<Vault>(() => loadVault());
  const [now, setNow] = useState<Date>(getNow);
  const [stories, setStories] = useState<NewsStory[]>([]);
  const [health, setHealth] = useState<AdapterHealth[]>([]);
  const [rejected, setRejected] = useState<RejectedItem[]>([]);
  const [liveOpps, setLiveOpps] = useState<GlobalOpportunity[]>([]);
  const [lastPolled, setLastPolled] = useState<string | null>(null);
  const [lastCycle, setLastCycle] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [log, setLog] = useState<IngestionLogLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>(parseHash);
  const [drawer, setDrawer] = useState<Drawer>({ open: false, tab: 'term' });
  const [modal, setModal] = useState<null | 'health' | 'vault'>(null);
  const [search, setSearch] = useState('');
  const [rolloverNotice, setRolloverNotice] = useState<string | null>(null);
  const storiesRef = useRef(stories);
  storiesRef.current = stories;
  const pollingRef = useRef(false);

  const setUser = useCallback((fn: (u: UserState) => UserState) => {
    setUserState((u) => {
      const n = fn(u);
      saveUser(n);
      return n;
    });
  }, []);
  const setVault = useCallback((v: Vault) => {
    saveVault(v);
    setVaultState(v);
  }, []);

  // theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', user.theme === 'dark');
  }, [user.theme]);

  // hydrate persisted archive
  useEffect(() => {
    loadPersisted().then((p) => {
      setStories(p.stories ?? []);
      setHealth(p.health ?? []);
      setRejected(p.rejected ?? []);
      setLastPolled(p.lastPolled);
      setLastCycle(p.lastCycle);
      setLiveOpps(p.liveOpps ?? []);
      setLoaded(true);
    });
  }, []);

  const tz = user.timezone;
  const cycle = currentCycle(now, tz);

  // UI refresh tick + exact midnight rollover timer
  useEffect(() => {
    const iv = setInterval(() => setNow(getNow()), Math.max(5, vault.uiRefreshSec) * 1000);
    let to: ReturnType<typeof setTimeout>;
    const arm = () => {
      to = setTimeout(() => {
        setNow(getNow());
        arm();
      }, Math.min(msUntilMidnight(getNow(), tz) + 500, 2 ** 31 - 1));
    };
    arm();
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [vault.uiRefreshSec, tz, getNow]);

  // Detect rollover: moves yesterday into archive (purely a view split — nothing deleted).
  useEffect(() => {
    if (!loaded) return;
    if (lastCycle && lastCycle !== cycle) {
      setRolloverNotice(`New daily cycle started (${cycle}). Yesterday’s stories moved to the Historical Archive — your read history, saves and tracker are untouched.`);
    }
    if (lastCycle !== cycle) {
      setLastCycle(cycle);
      savePersisted({ stories: storiesRef.current, health, rejected, lastPolled, lastCycle: cycle, liveOpps });
    }
  }, [cycle, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const { todayStories, archive } = useMemo(() => splitByCycle(stories, now, tz), [stories, now, tz]);

  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setPolling(true);
    setLog([]);
    try {
      const n = getNow();
      const r = await runIngestion(storiesRef.current, vault, tz, user.disabledAdapters, (l) => setLog((x) => [...x, l]), n);
      setStories(r.stories);
      setHealth(r.health);
      const rej = [...r.rejected, ...rejected].slice(0, 300);
      setRejected(rej);
      const lo = r.liveOpps ?? liveOpps;
      setLiveOpps(lo);
      const at = n.toISOString();
      setLastPolled(at);
      setNow(n);
      await savePersisted({ stories: r.stories, health: r.health, rejected: rej, lastPolled: at, lastCycle: currentCycle(n, tz), liveOpps: lo });
    } finally {
      pollingRef.current = false;
      setPolling(false);
    }
  }, [vault, tz, user.disabledAdapters, rejected, liveOpps, getNow]);

  // Background ingestion schedule (independent from UI refresh).
  const pollRef = useRef(poll);
  pollRef.current = poll;
  useEffect(() => {
    if (!loaded || !autoPoll) return;
    const due = !lastPolled || Date.now() - new Date(lastPolled).getTime() > vault.pollIntervalMin * 60000;
    if (due) pollRef.current();
    const iv = setInterval(() => pollRef.current(), vault.pollIntervalMin * 60000);
    return () => clearInterval(iv);
  }, [loaded, autoPoll, vault.pollIntervalMin]); // eslint-disable-line react-hooks/exhaustive-deps

  // hash routing
  useEffect(() => {
    const on = () => setView(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((v: View) => {
    setView(v);
    try {
      if (location.hash !== viewHash(v)) history.pushState(null, '', viewHash(v));
    } catch {
      /* sandboxed frames */
    }
    window.scrollTo?.({ top: 0 });
  }, []);

  const setRead = useCallback(
    (id: string, read: boolean) =>
      setUser((u) => {
        const readMap = { ...u.readMap };
        if (read) readMap[id] = readMap[id] ?? new Date().toISOString();
        else delete readMap[id];
        return { ...u, readMap };
      }),
    [setUser],
  );
  const markManyRead = useCallback(
    (ids: string[]) =>
      setUser((u) => {
        const readMap = { ...u.readMap };
        const at = new Date().toISOString();
        ids.forEach((id) => (readMap[id] = readMap[id] ?? at));
        return { ...u, readMap };
      }),
    [setUser],
  );
  const toggleSaveStory = useCallback(
    (id: string) =>
      setUser((u) => ({ ...u, savedStories: u.savedStories.includes(id) ? u.savedStories.filter((x) => x !== id) : [...u.savedStories, id] })),
    [setUser],
  );
  const toggleSaveOpp = useCallback(
    (id: string) =>
      setUser((u) => {
        const saved = u.savedOpps.includes(id);
        return {
          ...u,
          savedOpps: saved ? u.savedOpps.filter((x) => x !== id) : [...u.savedOpps, id],
          tracker: saved || u.tracker[id] ? u.tracker : { ...u.tracker, [id]: blankTracker() },
        };
      }),
    [setUser],
  );
  const updateTracker = useCallback(
    (id: string, patch: Partial<TrackerEntry>) =>
      setUser((u) => {
        const cur = u.tracker[id] ?? blankTracker();
        return {
          ...u,
          savedOpps: u.savedOpps.includes(id) ? u.savedOpps : [...u.savedOpps, id],
          tracker: { ...u.tracker, [id]: { ...cur, ...patch, checked: { ...cur.checked, ...(patch.checked ?? {}) }, updatedAt: new Date().toISOString() } },
        };
      }),
    [setUser],
  );
  const learnConcept = useCallback(
    (term: string) => setUser((u) => (u.learnedConcepts[term] ? u : { ...u, learnedConcepts: { ...u.learnedConcepts, [term]: new Date().toISOString() } })),
    [setUser],
  );

  const allOpps = useMemo(() => [...CURATED_OPPORTUNITIES, ...liveOpps], [liveOpps]);

  const value: Ctx = {
    user,
    vault,
    setUser,
    setVault,
    now,
    cycle,
    stories,
    todayStories,
    archive,
    health,
    rejected,
    liveOpps,
    allOpps,
    lastPolled,
    polling,
    log,
    loaded,
    poll,
    view,
    go,
    drawer,
    openDrawer: (d) => setDrawer({ ...d, open: true }),
    closeDrawer: () => setDrawer((d) => ({ ...d, open: false })),
    modal,
    setModal,
    search,
    setSearch,
    setRead,
    markManyRead,
    toggleSaveStory,
    toggleSaveOpp,
    updateTracker,
    learnConcept,
    rolloverNotice,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
