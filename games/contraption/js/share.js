// A machine in a link, with no server: the parts are packed as JSON,
// deflated with the browser's CompressionStream and written as base64url
// in the fragment (#m=…), which never leaves the device. Works the same in
// Node for the tests. Decoding goes through format.js, so links made today
// keep opening after the format grows.
import { FORMAT, fromSave } from './format.js';
import { ENGINE } from './physics.js';

export const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Pack a machine (and the level it is for) into a short string. */
export async function encodeMachine(levelId, parts) {
  const data = { v: FORMAT, e: ENGINE, l: levelId, p: parts.map(({ id, fixed, ...p }) => p) };
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'undefined') return `j${b64url(json)}`;
  return `z${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

/** Unpack a string from encodeMachine: { level, engine, parts } or null if it is not one. */
export async function decodeMachine(str) {
  try {
    const kind = str[0];
    let bytes = unb64url(str.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return null;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const { parts, engine } = fromSave({ v: data.v, engine: data.e, parts: data.p });
    return { level: String(data.l), engine, parts: parts.map((p, i) => ({ ...p, id: `s${i}` })) };
  } catch {
    return null;
  }
}

/** The machine in a page address, if there is one. */
export const machineFromHash = (hash) => /[#&]m=([A-Za-z0-9_-]+)/.exec(hash)?.[1] ?? null;
