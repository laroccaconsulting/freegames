// Persistent settings with defaults and change listeners.

export function makeSettings(store, defaults) {
  const values = { ...defaults, ...(store.get('settings') || {}) };
  const listeners = new Set();
  return {
    get: (k) => values[k],
    all: () => ({ ...values }),
    set(k, v) {
      if (values[k] === v) return;
      values[k] = v;
      store.set('settings', values);
      listeners.forEach((fn) => fn(k, v));
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
