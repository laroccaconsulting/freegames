// The word lists (data/words.txt and data/common.txt, built by
// scripts/build-words.mjs from public-domain sources). Pure: the caller
// supplies the text, so the same code runs in the browser and the tests.

export function makeDict(wordsText, commonText) {
  const split = (t) => t.split('\n').filter(Boolean);
  const words = split(wordsText);
  const common = split(commonText);
  const byLen = (list) => {
    const m = new Map();
    for (const w of list) {
      if (!m.has(w.length)) m.set(w.length, []);
      m.get(w.length).push(w);
    }
    return m;
  };
  return {
    words: new Set(words),
    common: new Set(common),
    list: words,
    commonList: common,
    byLen: byLen(words),
    commonByLen: byLen(common),
  };
}

// Letter counts, for "can this word be made from these letters?"
export function counts(word) {
  const c = new Uint8Array(26);
  for (let i = 0; i < word.length; i++) c[word.charCodeAt(i) - 97]++;
  return c;
}

export function fits(word, pool) {
  const c = new Uint8Array(26);
  for (let i = 0; i < word.length; i++) {
    const k = word.charCodeAt(i) - 97;
    if (++c[k] > pool[k]) return false;
  }
  return true;
}
