// The Rankings server (Supabase; supabase/migrations/ has the database): the
// only place the game talks to it. Players sign in anonymously, and every
// call goes through the database's functions (supabase.rpc).
//
// The client is made on first use, from a dynamic import, so nothing loads
// or touches the network until a call is made (the player opens Rankings
// and joins). Supabase keeps the anonymous session in localStorage itself.
// Without the env keys (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) the
// whole thing is off: `available` is false and every call throws 'off'.

// Why a call failed (OnlineError.kind):
//   'off'      Rankings aren't set up (no env keys);
//   'network'  the server couldn't be reached (offline, timed out);
//   'auth'     no session, or no captain for it: the player has to join;
//   'server'   the server said no, with a message written for players.
export class OnlineError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// The database's own messages for a caller with no session or no captain
// (set_captain_name and friends raise these).
const AUTH_MESSAGES = ['not signed in', 'no captain yet'];
// Postgres' code for a raise exception (the functions' player messages).
const RAISED = 'P0001';

async function supabaseClient(url, key) {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}

// A Supabase or fetch error as an OnlineError.
function asOnlineError(error) {
  if (error instanceof OnlineError) return error;
  const message = error?.message ?? String(error);
  if (AUTH_MESSAGES.includes(message)) return new OnlineError('auth', message);
  if (error?.code === RAISED) return new OnlineError('server', message);
  // An expired or unknown session (PostgREST's JWT errors, HTTP 401).
  if (error?.status === 401 || /jwt/i.test(message)) return new OnlineError('auth', message);
  return new OnlineError('network', message);
}

export class Online {
  // createClient(url, key) -> a Supabase client (tests pass a mock).
  constructor({ url = '', key = '', createClient = supabaseClient } = {}) {
    this.url = url;
    this.key = key;
    this.createClient = createClient;
    this.clientPromise = null;
  }

  get available() { return !!(this.url && this.key); }

  async client() {
    if (!this.available) throw new OnlineError('off', "Rankings aren't set up yet.");
    if (!this.clientPromise) {
      this.clientPromise = this.createClient(this.url, this.key);
      // A failed import (offline before it was cached) can be tried again.
      this.clientPromise.catch(() => { this.clientPromise = null; });
    }
    return this.clientPromise;
  }

  // Whether this device has a Supabase session (read from localStorage,
  // no network unless it needs refreshing).
  async hasSession() {
    if (!this.available) return false;
    try {
      const { data } = await (await this.client()).auth.getSession();
      return !!data?.session;
    } catch {
      return false;
    }
  }

  async signIn() {
    const c = await this.client();
    const { data } = await c.auth.getSession();
    if (data?.session) return;
    const { error } = await c.auth.signInAnonymously();
    if (error) throw asOnlineError(error);
  }

  async rpc(name, args) {
    let result;
    try {
      result = await (await this.client()).rpc(name, args);
    } catch (err) {
      throw asOnlineError(err);
    }
    if (result.error) throw asOnlineError(result.error);
    return result.data;
  }

  // --- The captain ---

  // Sign in anonymously (once per device) and create the captain, or rename
  // them. Returns { name, code, best }.
  async join(name) {
    await this.signIn();
    return this.setName(name);
  }

  async setName(name) {
    const [row] = await this.rpc('set_captain_name', { p_name: name });
    return toProfile(row);
  }

  // { name, code, best }, or null if this session has no captain.
  async profile() {
    const [row] = (await this.rpc('my_profile')) ?? [];
    return row ? toProfile(row) : null;
  }

  // Offer a new best depth; returns the best the server now holds (it can
  // be less: it limits how fast a score may rise).
  async submitDepth(depth) {
    return this.rpc('submit_abyss_depth', { p_depth: depth });
  }

  // --- Crew ---

  // Returns { id, name } of the captain whose code it is.
  async addFriend(code) {
    const [row] = await this.rpc('add_friend', { p_code: code });
    return { id: row.friend_id, name: row.captain_name };
  }

  async removeFriend(id) {
    await this.rpc('remove_friend', { p_friend: id });
  }

  // --- Boards ---

  // The top `limit` captains: [{ rank, name, best, me }].
  async worldTop(limit = 50) {
    const rows = (await this.rpc('world_top', { p_limit: limit })) ?? [];
    return rows.map((r) => ({
      rank: Number(r.rank), name: r.captain_name, best: r.best, me: !!r.is_me,
    }));
  }

  // { rank, best, total }, or null until the player has a depth.
  async myRank() {
    const [row] = (await this.rpc('my_rank')) ?? [];
    return row ? { rank: Number(row.rank), best: row.best, total: Number(row.total) } : null;
  }

  // The player and their crew: [{ rank, id, name, best, me }].
  async friendsBoard() {
    const rows = (await this.rpc('friends_board')) ?? [];
    return rows.map((r) => ({
      rank: Number(r.rank), id: r.friend_id, name: r.captain_name, best: r.best, me: !!r.is_me,
    }));
  }
}

const toProfile = (row) => ({ name: row.captain_name, code: row.code, best: row.best ?? 0 });
