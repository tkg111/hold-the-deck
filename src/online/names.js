import { RANKINGS } from '../config.js';

// Captain names, checked before they're sent (the server checks the shape
// again): the database's pattern, and a short list of blocked words, enough
// for a board among friends and testers.

const LOOK_ALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g' };

// The name as the blocked-word check reads it: lower case, without spaces,
// _ or -, with look-alike digits as letters ("F_u-c k", "sh1t").
const squash = (name) => name.toLowerCase().replace(/[\s_-]/g, '').replace(/[0-9]/g, (d) => LOOK_ALIKES[d] ?? d);

// The name as it would be saved (trimmed), or why it can't be: { name } or
// { error } (a message for the player).
export function checkName(raw) {
  const name = String(raw ?? '').trim();
  if (!RANKINGS.name.pattern.test(name)) return { error: 'Names are 3-16 letters, numbers, spaces, _ or -' };
  const flat = squash(name);
  if (RANKINGS.blockedWords.some((w) => flat.includes(w))) return { error: 'Pick another name, captain.' };
  return { name };
}

// A crew code as typed (any case, stray spaces), or null if it can't be one.
export function cleanCode(raw) {
  const code = String(raw ?? '').toUpperCase().replace(/\s/g, '');
  return new RegExp(`^[A-Z2-9]{${RANKINGS.codeLength}}$`).test(code) ? code : null;
}
