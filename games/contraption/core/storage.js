// Safe localStorage wrapper. Storage can be missing, full, or throw
// (private mode, blocked site data), so every access is guarded and the
// game keeps working in memory when it fails.

const memory = new Map();

export function makeStore(namespace) {
  const key = (k) => `${namespace}:${k}`;
  return {
    get(k, fallback = null) {
      try {
        const raw = localStorage.getItem(key(k));
        if (raw != null) return JSON.parse(raw);
      } catch {
        if (memory.has(key(k))) return memory.get(key(k));
      }
      return memory.has(key(k)) ? memory.get(key(k)) : fallback;
    },
    set(k, value) {
      memory.set(key(k), value);
      try {
        localStorage.setItem(key(k), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    remove(k) {
      memory.delete(key(k));
      try {
        localStorage.removeItem(key(k));
      } catch {
        /* ignore */
      }
    },
  };
}
