// An in-memory stand-in for the Rankings database (supabase/migrations/:
// 001_rankings.sql, with 002_tune_rate.sql's speed limit) and the Supabase client calls the game makes
// (auth.getSession, auth.signInAnonymously, rpc). Each client is one
// device with its own session; they share the server. The functions follow
// the SQL's rules, including submit_abyss_depth's speed limit.
// Used by scripts/tests/rankings.mjs; in a dev build it can stand in for a
// real project from the browser console:
//   const { fakeServer } = await import('/scripts/tests/fakeSupabase.mjs');
//   const { online } = await import('/src/online/index.js');
//   const server = fakeServer(); server.seed();
//   Object.assign(online, { url: 'fake', key: 'fake', createClient: async () => server.client() });

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FIRST_ALLOW = 200;
const SLACK = 10;
const SEC_PER_DEPTH = 4.5;   // 002_tune_rate.sql

class Raise extends Error {}

export function fakeServer({ now = () => Date.now(), secPerDepth = SEC_PER_DEPTH } = {}) {
  const profiles = new Map();   // id -> { name, code }
  const scores = new Map();     // id -> { best, at }
  const friends = new Set();    // `${a}|${b}`
  let users = 0;
  let codes = 0;
  const server = {
    offline: false,             // every call fails like fetch does offline
    calls: [],                  // [name] of every call that reached the "network"
    profiles, scores, friends,
  };

  const newCode = () => {
    let code;
    do {
      code = '';
      let n = ++codes * 7919;
      for (let i = 0; i < 6; i++) { code += CODE_CHARS[n % CODE_CHARS.length]; n = Math.floor(n / CODE_CHARS.length) + i * 13; }
    } while ([...profiles.values()].some((p) => p.code === code));
    return code;
  };
  const order = (a, b) => b.best - a.best || a.at - b.at;
  const ranked = (ids, uid) => {
    const rows = ids.map((id) => ({ id, ...scores.get(id), name: profiles.get(id).name })).sort(order);
    return rows.map((r) => ({
      rank: 1 + rows.filter((o) => order(o, r) < 0).length, id: r.id, name: r.name, best: r.best, me: r.id === uid,
    }));
  };

  const fns = {
    set_captain_name(uid, { p_name }) {
      const n = String(p_name ?? '').trim();
      if (!/^[A-Za-z0-9 _-]{3,16}$/.test(n)) throw new Raise('Names are 3-16 letters, numbers, spaces, _ or -');
      const p = profiles.get(uid);
      if (p) p.name = n;
      else profiles.set(uid, { name: n, code: newCode() });
      if (!scores.has(uid)) scores.set(uid, { best: 0, at: now() });
      return fns.my_profile(uid);
    },
    my_profile(uid) {
      const p = profiles.get(uid);
      return p ? [{ captain_name: p.name, code: p.code, best: scores.get(uid).best }] : [];
    },
    submit_abyss_depth(uid, { p_depth }) {
      if (!Number.isInteger(p_depth) || p_depth < 0 || p_depth > 100000) throw new Raise('bad depth');
      const s = scores.get(uid);
      if (!s) throw new Raise('no captain yet');
      if (p_depth <= s.best) return s.best;
      const lim = s.best === 0 ? FIRST_ALLOW : s.best + SLACK + Math.floor((now() - s.at) / 1000 / secPerDepth);
      s.best = Math.min(p_depth, lim);
      s.at = now();
      return s.best;
    },
    add_friend(uid, { p_code }) {
      if (!profiles.has(uid)) throw new Raise('no captain yet');
      const code = String(p_code ?? '').trim().toUpperCase();
      const fid = [...profiles.keys()].find((id) => profiles.get(id).code === code);
      if (!fid) throw new Raise('No captain has that code');
      if (fid === uid) throw new Raise('That is your own code');
      if ([...friends].filter((f) => f.startsWith(`${uid}|`)).length >= 50) throw new Raise('Your crew list is full (50)');
      friends.add(`${uid}|${fid}`);
      friends.add(`${fid}|${uid}`);
      return [{ friend_id: fid, captain_name: profiles.get(fid).name }];
    },
    remove_friend(uid, { p_friend }) {
      friends.delete(`${uid}|${p_friend}`);
      friends.delete(`${p_friend}|${uid}`);
      return null;
    },
    world_top(uid, { p_limit = 50 } = {}) {
      const ids = [...scores.keys()].filter((id) => scores.get(id).best > 0);
      return ranked(ids, uid).slice(0, Math.min(Math.max(p_limit ?? 50, 1), 100))
        .map((r) => ({ rank: r.rank, captain_name: r.name, best: r.best, is_me: r.me }));
    },
    my_rank(uid) {
      const me = scores.get(uid);
      if (!me || me.best <= 0) return [];
      const ids = [...scores.keys()].filter((id) => scores.get(id).best > 0);
      const row = ranked(ids, uid).find((r) => r.me);
      return [{ rank: row.rank, best: me.best, total: ids.length }];
    },
    friends_board(uid) {
      const ids = [uid, ...[...friends].filter((f) => f.startsWith(`${uid}|`)).map((f) => f.split('|')[1])]
        .filter((id) => profiles.has(id));
      return ranked(ids, uid).map((r) => ({
        rank: r.rank, friend_id: r.id, captain_name: r.name, best: r.best, is_me: r.me,
      }));
    },
  };

  const networkError = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });

  // A device: its own session (null until it signs in).
  server.client = (session = null) => {
    const device = {
      session,
      auth: {
        getSession: async () => ({ data: { session: device.session }, error: null }),
        signInAnonymously: async () => {
          server.calls.push('signInAnonymously');
          if (server.offline) return { data: null, error: { message: 'Failed to fetch', status: 0 } };
          device.session = { user: { id: `user-${++users}` } };
          return { data: { session: device.session }, error: null };
        },
      },
      rpc: async (name, args = {}) => {
        server.calls.push(name);
        if (server.offline) return networkError();
        const uid = device.session?.user.id;
        try {
          if (!uid) throw new Raise('not signed in');
          return { data: fns[name](uid, args), error: null };
        } catch (err) {
          if (!(err instanceof Raise)) throw err;
          return { data: null, error: { message: err.message, code: 'P0001' } };
        }
      },
    };
    return device;
  };

  // Captains on the board already: [name, best] each (their own devices).
  server.seed = (list = [['Salty Sam', 212], ['Bosun', 187], ['Mei the Bold', 160], ['Captain Ah Seng', 141],
    ['Barnacle Bill', 133], ['Peg Leg Lim', 120], ['Coral', 98], ['Old Tam', 64], ['Ironjaw', 40]]) => list.map(([name, best]) => {
    const d = server.client();
    const id = `user-${++users}`;
    d.session = { user: { id } };
    fns.set_captain_name(id, { p_name: name });
    scores.get(id).best = best;
    return { id, code: profiles.get(id).code, device: d };
  });

  return server;
}
