// Seeded random numbers so every deal has a number that can be replayed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function randomSeed(max = 999999) {
  const buf = new Uint32Array(1);
  (globalThis.crypto || { getRandomValues: (b) => ((b[0] = Math.random() * 2 ** 32), b) }).getRandomValues(buf);
  return (buf[0] % max) + 1;
}
