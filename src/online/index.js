import { Boards } from './Boards.js';
import { Online } from './Online.js';
import { ScoreSync } from './ScoreSync.js';

// Rankings' API for the rest of the game, which never imports Supabase
// itself:
//   online         the server's calls (join, setName, submitDepth,
//                  worldTop, ...), and `available` (false without the env
//                  keys);
//   boards         the Rankings screen's boards, cached in the save;
//   scores         sends the best Abyss depth (scores.check(): on load and
//                  on every save);
//   rankingsHost   the game's side: GameScene attaches its save with
//                  attachRankings once it has loaded; joined() after the
//                  player joins.

const env = import.meta.env ?? {};

export const online = new Online({ url: env.VITE_SUPABASE_URL ?? '', key: env.VITE_SUPABASE_ANON_KEY ?? '' });
export const boards = new Boards({ online });
export const scores = new ScoreSync({ online });

// A depth that couldn't be sent goes when the device is back online.
if (typeof window !== 'undefined') window.addEventListener('online', () => scores.check());

const host = { getProgress: () => null, save: () => {} };

// getProgress() -> the Progress in play (it changes when a save is
// imported); save() writes it.
export function attachRankings({ getProgress, save }) {
  Object.assign(host, { getProgress, save });
  boards.attach({ record: () => getProgress().online, save });
  scores.attach({ record: () => getProgress().online, best: () => getProgress().abyss.best, save });
}

export const rankingsHost = {
  // The player has just joined (Progress.online is filled in).
  joined() {
    host.save();
    scores.joined();
  },
};

export { OnlineError } from './Online.js';
export { checkName, cleanCode } from './names.js';
