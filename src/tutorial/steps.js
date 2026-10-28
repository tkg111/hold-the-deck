import { TUTORIAL } from '../config.js';

// The Captain's tutorial as data: the onboarding script for a new save and
// the one-time tips (see TutorialManager for how they run). A script is a
// list of steps, each:
//   id: a name (the onboarding's are saved as its progress)
//   trigger: the event (see TutorialHost) that starts it; 'next' (the
//     default after a script's first step): right after the step before it
//   when(g, data): it only starts if this holds (g: the TutorialHost)
//   skipIf(g): checked when it would show: if this holds it's skipped, and
//     a 'next' step after it shows in its place (with its lines, if it has
//     none of its own)
//   resume: (onboarding) a reload while it's waiting goes back to this
//     step; mid-way through a run of steps, that step shows at the next idle
//   adapt(g): overrides (mode, target, lines...) worked out when it shows
//   mode: 'dialog' (dims everything, tap through the lines), 'look'
//     (spotlights the target, tap through), 'guided' (spotlights the
//     target, only it takes input until `action`) or 'banner' (a strip at
//     the top that doesn't stop anything)
//   lines: [{ face, text }] (portrait faces: talk0, talk1, happy, worried,
//     point, laugh); a guided step's last line stays up until its action
//   target: the spotlight's target key (registered by the UI; see
//     TutorialManager.registerTarget)
//   action: the event that completes a guided step (actionWhen(data): it
//     only counts if this holds)
//   needs: where it can show: 'idle' (the battle between waves, nothing
//     open over it; the default), 'wave' (a wave under way), a scene key
//     (that screen open) or 'any' (banners' default)
//   pause: whether it pauses its scene (dialog and look steps do)
//   delayMs: waits this long (real time) after its trigger
//   prepare(g) / finish(g): run as it shows / once it's done
//   dropOn: events that throw it away if it's still waiting to show

const line = (face, text) => ({ face, text });

// After a wave (or at an idle that may follow one): once its CLEARED /
// SUNK banner has shown.
const afterWave = TUTORIAL.waveDelayMs;

// The onboarding (new saves, and Replay tutorial in Settings). Its progress
// is saved as the id of the step it's waiting on (or 'done'); a reload
// mid-way goes back to the step's `resume`.
export const ONBOARDING = [
  {
    id: 'O1',
    trigger: 'idle',
    mode: 'dialog',
    lines: [
      line('laugh', 'Ahoy, greenhorn! Welcome aboard the finest ship on the seven seas.'),
      line('happy', "Well... the finest ship in this cove. She'll grow."),
      line('talk0', "I'm the Captain. Stick with me and you'll learn the ropes."),
    ],
  },
  {
    id: 'O2',
    resume: 'O1',
    mode: 'look',
    target: 'hull',
    lines: [
      line('point', 'This is our hull. Monsters come off that island to smash it.'),
      line('talk0', 'If it hits zero we limp home. No shame in it, we come back stronger.'),
    ],
  },
  {
    id: 'O3',
    resume: 'O1',
    mode: 'look',
    target: 'crew',
    lines: [
      line('point', "Our crew fight on their own. Your job is to make 'em stronger."),
      line('laugh', "Let's see what this island's got!"),
    ],
    // ...and the wave sets off.
    finish: (g) => g.startWave(),
  },
  {
    id: 'O4',
    trigger: 'enemy-killed',
    mode: 'banner',
    lines: [line('talk0', 'Gold! Every foe drops some.')],
  },
  {
    // The Shipwright is out between waves (unless it's been slid away): a
    // look at it, or open it with its handle.
    id: 'O5',
    trigger: 'wave-won',
    resume: 'O5',
    delayMs: afterWave,
    adapt: (g) => (g.shipwrightOpen
      ? { mode: 'look', target: 'shipwright', lines: [line('point', "Time to spend that loot. Here's the Shipwright!")] }
      : {
        mode: 'guided', target: 'shipwrightHandle', action: 'shipwright-toggled', actionWhen: (d) => d.open,
        lines: [line('point', 'Time to spend that loot. Open the Shipwright!')],
      }),
  },
  {
    id: 'O6',
    resume: 'O5',
    skipIf: (g) => g.shipwrightTab === 'crew',
    mode: 'guided',
    target: 'shipwrightTab:crew',
    action: 'shipwright-tab',
    actionWhen: (d) => d.tab === 'crew',
    lines: [line('point', 'Train up a crew member. Stronger crew, quicker wins.')],
  },
  {
    // The cheapest crew upgrade; gold topped up to its price if short
    // (once, here).
    id: 'O6b',
    resume: 'O5',
    mode: 'guided',
    target: 'crewBuy',
    action: 'upgrade-bought',
    actionWhen: (d) => d.kind === 'crew',
    prepare: (g) => g.topUpForCrewBuy(),
  },
  {
    id: 'O7',
    resume: 'O5',
    mode: 'look',
    target: 'buyAmount',
    lines: [line('happy', 'Tip: MAX buys as many as you can afford.')],
  },
  {
    // (The Shipwright stays out between waves, so this follows the tip.)
    id: 'O8',
    resume: 'O5',
    mode: 'guided',
    target: 'setSail',
    action: 'wave-started',
    lines: [line('point', "Crew's ready. Hit SET SAIL! and show 'em what we've got!")],
  },
  {
    // A new deck: once gold first covers it, or after wave 5 (dialog only
    // if it's still out of reach then). Skipped with every deck built.
    id: 'O9',
    trigger: 'idle',
    resume: 'O9',
    delayMs: afterWave,
    when: (g) => g.canAffordDeck || g.progress.record.best >= 5,
    skipIf: (g) => !g.progress.canBuildDeck || (g.canAffordDeck && g.shipwrightOpen),
    mode: 'guided',
    target: 'shipwrightHandle',
    action: 'shipwright-toggled',
    actionWhen: (d) => d.open,
    adapt: (g) => (g.canAffordDeck ? {} : {
      mode: 'dialog', target: null, lines: [line('happy', 'Save up for a new deck! More deck, more room for crew.')],
    }),
    lines: [line('happy', 'Enough gold for a new deck! More deck, more room for crew.')],
  },
  {
    id: 'O9b',
    resume: 'O9',
    skipIf: (g) => !g.canAffordDeck || g.shipwrightTab === 'ship',
    mode: 'guided',
    target: 'shipwrightTab:ship',
    action: 'shipwright-tab',
    actionWhen: (d) => d.tab === 'ship',
  },
  {
    id: 'O9c',
    resume: 'O9',
    skipIf: (g) => !g.canAffordDeck,
    mode: 'guided',
    target: 'deckBuy',
    action: 'upgrade-bought',
    actionWhen: (d) => d.kind === 'deck',
  },
  {
    id: 'O10',
    resume: 'O10',
    mode: 'dialog',
    lines: [line('happy', "That's the basics, matey. I'll shout if I spot anything new.")],
  },
];

// One-time tips, by id (saved in tipsSeen once shown). Each is a script
// like the onboarding's; tipsOn (Settings) stops new ones.
export const TIPS = {
  first_loss: [{
    trigger: 'wave-ended',
    when: (g, d) => !d.won && !d.hunt && !d.dive,
    delayMs: afterWave,
    mode: 'dialog',
    lines: [
      line('worried', 'Blast, they broke through!'),
      line('talk0', "Don't fret, we keep every coin. Spend it at the Shipwright and try again."),
    ],
  }],
  merchant: [
    {
      // The first one is always a Trade Cog (TutorialManager.prepareMerchant),
      // and the battle runs at TUTORIAL.merchantSpeed until it's plundered or gone.
      trigger: 'merchant-tappable',
      needs: 'wave',
      mode: 'guided',
      target: 'merchant',
      action: 'merchant-plundered',
      slow: true,
      abortOn: ['merchant-gone', 'wave-ended'],
      lines: [line('point', 'A fat merchant ship! Tap it, quick!')],
    },
    {
      needs: 'wave',
      mode: 'dialog',
      lines: [line('laugh', 'Har! Free gold. Keep an eye on the horizon.')],
    },
  ],
  boss_incoming: [{
    trigger: 'wave-started',
    when: (g, d) => d.boss && !d.hunt && !d.dive,
    needs: 'wave',
    mode: 'dialog',
    lines: [
      line('worried', "Something big's stirring under the water..."),
      line('worried', 'Brace yourselves!'),
    ],
  }],
  boss_material: [{
    trigger: 'boss-material',
    mode: 'banner',
    lines: [line('talk0', 'It dropped something! Take it to the Shipwright.')],
  }],
  ship_parts: [{
    trigger: 'scene-open',
    when: (g, d) => d.key === 'ShipyardScene',
    needs: 'ShipyardScene',
    mode: 'dialog',
    lines: [line('point', 'Boss materials make ship parts. They show right on our hull!')],
  }],
  boss_hunts: [{
    trigger: 'idle',
    when: (g) => g.huntsUnlocked,
    delayMs: afterWave,
    mode: 'banner',
    lines: [line('talk0', 'Need more materials? Hunt that boss again!')],
  }],
  chest: [{
    trigger: 'idle',
    when: (g) => g.progress.canOpenPack,
    delayMs: afterWave,
    mode: 'guided',
    target: 'chests',
    action: 'scene-open',
    actionWhen: (d) => d.key === 'PackScene',
    lines: [line('happy', "A Sea Dog Chest! There's new crew inside.")],
  }],
  expeditions: [
    {
      trigger: 'idle',
      when: (g) => g.expeditionsUnlocked,
      delayMs: afterWave,
      mode: 'guided',
      target: 'voyage',
      action: 'scene-open',
      actionWhen: (d) => d.key === 'ExpeditionScene',
      lines: [line('point', "Crew who aren't fighting can still earn. Send 'em on a voyage!")],
    },
    {
      needs: 'ExpeditionScene',
      mode: 'guided',
      target: 'expeditionSlot',
      action: 'expedition-plan',
    },
    {
      // A crewmate off the ship (none: the step moves on, see missingMs).
      needs: 'ExpeditionScene',
      mode: 'guided',
      target: 'expeditionCrew',
      action: 'expedition-crew',
      lines: [line('talk0', 'Match their traits to the place for better loot.')],
    },
    {
      needs: 'ExpeditionScene',
      mode: 'guided',
      target: 'expeditionSend',
      action: 'expedition-sent',
    },
  ],
  galley: [
    {
      // The first cast is rigged (TUTORIAL.galleyRig): a Sardine with a
      // wide catch zone that can't get away.
      trigger: 'scene-open',
      when: (g, d) => d.key === 'GalleyScene',
      needs: 'GalleyScene',
      mode: 'guided',
      target: 'galleyCast',
      action: 'fishing-cast',
      prepare: (g) => g.rigCatch(),
      lines: [line('point', 'Every pirate needs a hot meal. Cast your line!')],
    },
    {
      trigger: 'fishing-bite',
      needs: 'GalleyScene',
      mode: 'guided',
      target: 'galleyBobber',
      action: 'reel-started',
      lines: [line('point', 'There! Tap now!')],
    },
    {
      // The reel waits while the Captain talks.
      needs: 'GalleyScene',
      mode: 'look',
      target: 'galleyReel',
      lines: [line('point', "Tap when the hook's in the green!")],
    },
    {
      trigger: 'fish-landed',
      needs: 'GalleyScene',
      mode: 'dialog',
      lines: [line('happy', 'A Sardine! Three of those make a fine stew.')],
    },
  ],
  cooking: [{
    trigger: ['fish-landed', 'idle', 'scene-open'],
    when: (g) => g.anyRecipeKnown,
    mode: 'banner',
    lines: [line('talk0', 'New recipe! Eat a meal for a boost that lasts 10 waves.')],
  }],
  ember: [islandTip('ember_isle', [line('worried', 'Ember Isle. Watch the sky, lava bombs!')])],
  frost: [islandTip('frostbite_reef', [
    line('worried', 'Frostbite Reef. Blizzards freeze the crew stiff.'),
    line('talk0', 'A hot chowder would help...'),
  ])],
  fog: [islandTip('fogbound_isle', [
    line('worried', 'Fogbound Isle... hear that singing?'),
    line('talk0', "Don't let the Siren charm our crew."),
  ])],
  finale: [{
    trigger: 'wave-started',
    when: (g, d) => d.finale && !d.hunt && !d.dive,
    mode: 'banner',
    lines: [line('talk0', "Two of 'em at once?! All hands on deck!")],
  }],
  abyss: [{
    trigger: 'idle',
    when: (g) => g.progress.abyssUnlocked && g.progress.abyss.revealed,
    mode: 'dialog',
    lines: [
      line('worried', 'The Abyss. No bottom, no end.'),
      line('laugh', 'Every depth gets meaner. So do we!'),
    ],
  }],
  // The Uncharted Seas open with the first dive (at the next idle).
  uncharted: [{
    trigger: 'idle',
    when: (g) => g.progress.unchartedUnlocked,
    mode: 'dialog',
    lines: [
      line('point', "Uncharted waters, Cap'n! Short voyages, strange rules..."),
      line('laugh', '...and treasure that makes our crew legends.'),
    ],
  }],
  awakened: [{
    trigger: 'crew-awakened',
    mode: 'banner',
    lines: [line('laugh', "Look at 'em now! A legend of the seas!")],
  }],
  log: [{
    trigger: 'scene-open',
    when: (g, d) => d.key === 'LogScene',
    mode: 'banner',
    lines: [line('talk0', "My log! Stats, bounties and every fish you've caught.")],
  }],
};

// Arriving at an island (sailing there from the map).
function islandTip(islandId, lines) {
  return {
    trigger: 'island-arrived',
    when: (g, d) => d.id === islandId,
    mode: 'dialog',
    lines,
  };
}
