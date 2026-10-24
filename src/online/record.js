import { RANKINGS } from '../config.js';

// The Rankings' part of the save (Progress.online): whether the player has
// joined, their captain name and crew code, the best depth the server holds
// for them (lastSubmittedDepth), and the last result of each board with
// when it was fetched (shown when the server can't be reached):
//   world: { at, rows: [{ rank, name, best, me }], me: { rank, best, total } | null }
//   crew:  { at, rows: [{ rank, id, name, best, me }] }
export function newOnlineRecord() {
  return {
    joined: false, name: '', code: '', lastSubmittedDepth: 0, world: null, crew: null,
  };
}

const int = (v) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function rowFromSave(r) {
  if (!r || typeof r !== 'object') return null;
  const row = {
    rank: int(r.rank), name: str(r.name, RANKINGS.name.max), best: int(r.best), me: r.me === true,
  };
  if (typeof r.id === 'string') row.id = r.id.slice(0, 64);
  return row;
}

function boardFromSave(b) {
  if (!b || typeof b !== 'object' || !Number.isFinite(b.at) || !Array.isArray(b.rows)) return null;
  const board = { at: b.at, rows: b.rows.map(rowFromSave).filter(Boolean).slice(0, 100) };
  if ('me' in b) {
    const m = b.me;
    board.me = m && typeof m === 'object' ? { rank: int(m.rank), best: int(m.best), total: int(m.total) } : null;
  }
  return board;
}

// A saved record, checked like the rest of the save.
export function onlineFromSave(o) {
  const record = newOnlineRecord();
  if (!o || typeof o !== 'object') return record;
  record.joined = o.joined === true;
  record.name = str(o.name, RANKINGS.name.max);
  record.code = str(o.code, RANKINGS.codeLength);
  record.lastSubmittedDepth = int(o.lastSubmittedDepth);
  record.world = boardFromSave(o.world);
  record.crew = boardFromSave(o.crew);
  return record;
}

// A deep copy for Progress.toSave().
export const onlineToSave = (o) => JSON.parse(JSON.stringify(o));
