import { MOBILE } from '../config.js';
import { progressFromRecord, saveRecord, SaveError } from './Save.js';

// Save codes for Settings' Export save / Import save: the save record
// (Save.saveRecord) as JSON, deflated and base64'd, behind a prefix naming
// the format (MOBILE.saveCode.prefix). Where the browser can't compress,
// the JSON goes uncompressed behind rawPrefix (both are read either way).

const { prefix, rawPrefix } = MOBILE.saveCode;

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(str) {
  const s = atob(str);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// The code for this progress.
export async function encodeSave(progress) {
  const json = new TextEncoder().encode(JSON.stringify(saveRecord(progress)));
  if (!canCompress()) return rawPrefix + toBase64(json);
  return prefix + toBase64(await pipe(json, new CompressionStream('deflate-raw')));
}

// Messages for a code that can't be loaded (shown in the Import dialog).
export const IMPORT_ERRORS = {
  format: "That's not a save code. Check it was copied whole.",
  newer: 'That save is from a newer version of the game. Update this one first.',
};

// A pasted code as { progress } or { error: an IMPORT_ERRORS key }.
// Whitespace (line breaks from a chat app) is ignored.
export async function decodeSave(code) {
  const clean = String(code ?? '').replace(/\s+/g, '');
  let record;
  try {
    let bytes;
    if (clean.startsWith(prefix)) {
      if (!canCompress()) throw new Error('no DecompressionStream');
      bytes = await pipe(fromBase64(clean.slice(prefix.length)), new DecompressionStream('deflate-raw'));
    } else if (clean.startsWith(rawPrefix)) {
      bytes = fromBase64(clean.slice(rawPrefix.length));
    } else {
      return { error: 'format' };
    }
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: 'format' };
  }
  try {
    return { progress: progressFromRecord(record) };
  } catch (err) {
    return { error: err instanceof SaveError ? err.reason : 'format' };
  }
}
