import Phaser from 'phaser';
import { ABYSS, ENEMIES, UNCHARTED } from '../config.js';
import { LAYOUT } from '../layout.js';

// The Abyss's currents during a depth (ABYSS.currents; which are active comes
// from Abyss.depthCurrents). Volcanic, Blizzard and Fogbound are the islands'
// own hazards (Volcano, Blizzard, Mists, given the depth's abyssIsland); the
// rest live here: Frenzied hurries every enemy (enemyPace, read by
// Enemy.pace), Armoured is in the depth's HP scaling, Shielded gives every
// n-th enemy an Ice Witch's shield as it spawns, Siren's Call charms a
// crewmate every so often, and Risen Dead may raise a killed enemy as a Bone
// Deckhand where it fell. Inert outside the Abyss. Runs on the battle's dt.
// A stage of the Uncharted Seas brings its sea's current (the Drowned
// Throne's) and its rules that act in battle: Gale (enemies walk faster,
// walkPace, read by Enemy.moveBoost), Night Watch (the crew's range,
// rangeMult, read by Hero.pickTarget) and Barnacled (every enemy comes in
// with an Ice Witch's shield).
export class Currents {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.enemyPace = 1;
    this.walkPace = 1;     // a stage's Gale
    this.rangeMult = 1;    // a stage's Night Watch
    this.rules = [];       // a stage's rules
    this.spawns = 0;       // enemies spawned this depth (Shielded counts them)
    this.charmTimer = 0;
  }

  has(id) { return this.active.includes(id); }

  // A wave starts. options: Abyss.depthOptions or Uncharted.stageOptions
  // (or an island's, with none).
  start({ abyss = null, stage = null } = {}) {
    const c = ABYSS.currents;
    const r = UNCHARTED.rules;
    this.active = abyss?.currents ?? stage?.currents ?? [];
    this.rules = stage?.rules ?? [];
    this.enemyPace = this.has('frenzied') ? c.frenzied.pace : 1;
    this.walkPace = this.rules.includes('gale') ? r.gale.speed : 1;
    this.rangeMult = this.rules.includes('night_watch') ? r.night_watch.range : 1;
    this.spawns = 0;
    this.charmTimer = c.sirens_call.every;
  }

  stop() {
    this.active = [];
    this.rules = [];
    this.enemyPace = 1;
    this.walkPace = 1;
    this.rangeMult = 1;
  }

  // Shielded: every n-th enemy that isn't a boss comes in with an Ice
  // Witch's shield (her share of its HP).
  // A stage's Barnacled: every enemy (not bosses) does.
  onSpawn(enemy) {
    if (enemy.def.boss || enemy.def.hazard) return;
    if (this.rules.includes('barnacled')) {
      enemy.giveIceShield(Math.round(enemy.maxHp * UNCHARTED.rules.barnacled.share), ENEMIES.iceWitch.witch);
      return;
    }
    if (!this.has('shielded')) return;
    this.spawns++;
    if (this.spawns % ABYSS.currents.shielded.every !== 0) return;
    const { witch } = ENEMIES.iceWitch;
    enemy.giveIceShield(Math.round(enemy.maxHp * witch.share), witch);
  }

  // Risen Dead: a killed enemy (not a boss) may rise as a Bone Deckhand where
  // it fell, on the lane.
  onDeath(enemy) {
    if (!this.has('risen_dead') || enemy.def.boss || enemy.def.hazard) return;
    const { chance, into } = ABYSS.currents.risen_dead;
    if (Math.random() >= chance) return;
    const minX = LAYOUT.shipContactX + ENEMIES[into].width / 2;
    enemy.spawnFrom(into, Phaser.Math.Clamp(enemy.x, minX, LAYOUT.enemySpawnX), { rising: true });
  }

  update(dt) {
    if (!this.has('sirens_call')) return;
    const s = ABYSS.currents.sirens_call;
    this.charmTimer -= dt;
    if (this.charmTimer > 0) return;
    this.charmTimer += s.every;
    // Siren's Call: a random crewmate who attacks (not The Captain), not
    // charmed already or just after a charm.
    const crew = this.scene.heroes.filter((h) => !h.def.aura && h.canBeCharmed);
    if (crew.length) crew[Math.floor(Math.random() * crew.length)].charm(s.charmMs);
  }
}
