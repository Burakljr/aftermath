// Guarded save storage. Every localStorage access is wrapped in try/catch, so the game
// still runs (without saving) in a sandboxed iframe, private mode or with storage disabled.
// main.js: const store = createStorage(); createGame({ save: store.load() }); store.save(game.save()).
export const SAVE_KEY = 'heroesdiner.save.v1';

export function createStorage(key = SAVE_KEY, getStore) {
  const get = getStore || (() => (typeof window !== 'undefined' ? window.localStorage : null));
  const store = () => { try { return get(); } catch { return null; } };
  return {
    key,
    load() {
      try { const s = store(); return s ? s.getItem(key) : null; } catch { return null; }
    },
    save(str) {
      try { const s = store(); if (!s) return false; s.setItem(key, str); return true; } catch { return false; }
    },
    clear() {
      try { const s = store(); if (!s) return false; s.removeItem(key); return true; } catch { return false; }
    },
  };
}
