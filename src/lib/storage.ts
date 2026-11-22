import { DEFAULTS, STORAGE_KEYS } from '../config';
import type { AdapterHealth, GlobalOpportunity, NewsStory, RejectedItem, UserState, Vault } from '../types';

export const DEFAULT_USER: UserState = {
  theme: 'dark',
  tone: 'genz',
  timezone: DEFAULTS.timezone,
  fontSize: 'M',
  autoMarkRead: DEFAULTS.autoMarkReadOnOpen,
  readMap: {},
  savedStories: [],
  savedOpps: [],
  tracker: {},
  learnedConcepts: {},
  framings: {},
  questions: [],
  followedTopics: [],
  disabledAdapters: [],
  notificationPrefs: { deadlines: true, newGrants: true, breaking: false },
};

export const DEFAULT_VAULT: Vault = {
  routerOrder: ['gemini', 'groq', 'openrouter'],
  ensemble: false,
  pollIntervalMin: DEFAULTS.pollIntervalMin,
  uiRefreshSec: DEFAULTS.uiRefreshSec,
  useServer: false,
};

function lsGet<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export const loadUser = () => lsGet<UserState>(STORAGE_KEYS.user, DEFAULT_USER);
export const saveUser = (u: UserState) => lsSet(STORAGE_KEYS.user, u);
export const loadVault = () => lsGet<Vault>(STORAGE_KEYS.vault, DEFAULT_VAULT);
export const saveVault = (v: Vault) => lsSet(STORAGE_KEYS.vault, v);

/* ---- Story archive: IndexedDB (large, never deleted) with localStorage / memory fallback ---- */
const DB = 'worldlens';
const STORE = 'kv';
let memory: Record<string, unknown> = {};

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const db = await idb();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = () => resolve((tx.result as T) ?? fallback);
      tx.onerror = () => resolve(fallback);
    });
  }
  try {
    const v = localStorage.getItem(key);
    if (v) return JSON.parse(v);
  } catch {
    /* ignore */
  }
  return (memory[key] as T) ?? fallback;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    return;
  }
  if (!lsSet(key, value)) memory[key] = value;
}

export interface Persisted {
  stories: NewsStory[];
  health: AdapterHealth[];
  rejected: RejectedItem[];
  lastPolled: string | null;
  lastCycle: string | null;
  liveOpps: GlobalOpportunity[];
}

export const loadPersisted = () =>
  kvGet<Persisted>(STORAGE_KEYS.stories, { stories: [], health: [], rejected: [], lastPolled: null, lastCycle: null, liveOpps: [] });
export const savePersisted = (p: Persisted) => kvSet(STORAGE_KEYS.stories, p);

export function resetMemoryStore() {
  memory = {};
}
