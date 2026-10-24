import { RANKINGS } from '../config.js';

// The Rankings screen's two boards, 'world' (world_top and my_rank) and
// 'crew' (friends_board), each fetched at most once per RANKINGS.refreshMs.
// Every result is kept in the save with its time (Progress.online.world /
// .crew), and shown instead when the server can't be reached.
//
// load(tab) resolves to { board, status }:
//   'fresh'    just fetched (or fetched under refreshMs ago);
//   'offline'  the device is offline or the call failed: board is the
//              cached one (or null), from board.at;
//   'join'     the server has no captain for this device: join again.
export class Boards {
  constructor({
    online, now = () => Date.now(),
    isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
    refreshMs = RANKINGS.refreshMs,
  }) {
    this.online = online;
    this.now = now;
    this.isOnline = isOnline;
    this.refreshMs = refreshMs;
    this.fetchedAt = { world: -Infinity, crew: -Infinity };
    this.lastStatus = { world: 'fresh', crew: 'fresh' };
    this.record = () => null;
    this.save = () => {};
  }

  // The game's save: record() -> Progress.online, save() writes it.
  attach({ record, save }) {
    this.record = record;
    this.save = save;
  }

  // Milliseconds until the tab may be fetched again (0: now).
  refreshIn(tab) { return Math.max(0, this.fetchedAt[tab] + this.refreshMs - this.now()); }

  // force: fetch even under refreshMs (after adding or removing a crewmate).
  async load(tab, { force = false } = {}) {
    const rec = this.record();
    if (!force && this.refreshIn(tab) > 0) return { board: rec[tab], status: this.lastStatus[tab] };
    this.fetchedAt[tab] = this.now();
    if (!this.isOnline()) return this.settle(tab, { board: rec[tab], status: 'offline' });
    try {
      const board = tab === 'world' ? await this.fetchWorld() : await this.fetchCrew(rec);
      rec[tab] = board;
      this.save();
      return this.settle(tab, { board, status: 'fresh' });
    } catch (err) {
      return this.settle(tab, { board: rec[tab], status: err.kind === 'auth' ? 'join' : 'offline', error: err });
    }
  }

  settle(tab, result) {
    this.lastStatus[tab] = result.status;
    return result;
  }

  async fetchWorld() {
    const [rows, me] = await Promise.all([this.online.worldTop(RANKINGS.worldLimit), this.online.myRank()]);
    return { at: this.now(), rows, me };
  }

  // The crew, and the player's own code if the save doesn't have it yet.
  async fetchCrew(rec) {
    const [rows, profile] = await Promise.all([this.online.friendsBoard(), rec.code ? null : this.online.profile()]);
    if (profile) Object.assign(rec, { code: profile.code, name: profile.name });
    return { at: this.now(), rows };
  }
}
