import Phaser from 'phaser';
import { DEV, DISPLAY, ENEMIES, GAME_SPEEDS, HEROES, SCENERY, SIM, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { DEV_TOOLS } from '../devFlag.js';
import {
  applyRenderScale, fullscreenSupported, isFullscreen, toggleFullscreen,
} from '../display.js';
import { Scenery } from '../scenery.js';
import { createAnimations, mapKey, preloadSprites } from '../sprites.js';
import { Storm } from '../storm.js';
import { Ship } from '../entities/Ship.js';
import { Hero } from '../entities/Hero.js';
import { clearSave, loadProgress, saveProgress } from '../systems/Save.js';
import { bossOf, composeWave, isBossWave, isSirenWave, WaveManager } from '../systems/WaveManager.js';
import { AbilitySystem } from '../systems/Abilities.js';
import { AbilityBar } from '../ui/AbilityBar.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { fmtNumber, pearlsLabel } from '../ui/format.js';
import { HeroPicker } from '../ui/HeroPicker.js';
import { Notices } from '../ui/Notices.js';
import { Shipwright } from '../ui/Shipwright.js';
import { Bar, icon, light, panel, text, UI, wantedKey } from '../ui/kit.js';

const STATE = { IDLE: 'idle', RUNNING: 'running' };


// Gold amounts floating up from kills.
const GOLD_TEXT = '#ffd86a';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    preloadSprites(this);
  }

  create() {
    // The battlefield is the fixed 480x270 world of layout.json, as wide as
    // the view. Extra height (up to 90 in a 4:3 view) is more sky above and
    // more sea below, SCENERY.skyShare of it on top. Nothing in the battle
    // depends on the view's size.
    applyRenderScale(this, { y: SCENERY.skyShare });
    createAnimations(this);
    this.progress = loadProgress();
    sfx.init(this.game);
    sfx.setMuted(this.progress.muted);
    this.state = STATE.IDLE;
    this.speed = this.speed ?? GAME_SPEEDS[0];  // kept across restarts in a session
    this.enemies = [];
    this.projectiles = [];

    this.scenery = new Scenery(this);
    this.storm = new Storm(this);
    this.ship = new Ship(this, this.progress);
    this.heroes = [];
    this.abilities = new AbilitySystem(this);
    this.rebuildHeroes();

    this.waves = new WaveManager(this);
    // Scene events outlive a restart, so unhook on shutdown to avoid double handlers.
    const handlers = {
      'enemy-killed': this.onEnemyKilled,
      'enemy-stole': this.onEnemyStole,
      'slot-clicked': this.onSlotClicked,
      'view-resize': this.onViewResize,
    };
    for (const [name, fn] of Object.entries(handlers)) this.events.on(name, fn, this);
    // Also save when the tab is hidden or closed, so kill gold from an
    // unfinished wave isn't lost (same as losing a wave: gold is kept).
    const onPageHide = () => this.save();
    window.addEventListener('pagehide', onPageHide);
    // Fullscreen can also be left with Esc, so follow the browser's state.
    const onFullscreenChange = () => this.refreshUi();
    document.addEventListener('fullscreenchange', onFullscreenChange);
    // Keys 1-6 use the abilities of the crew in slot order.
    const onKey = (event) => {
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= 6) this.useAbility(n - 1, { fromKey: true });
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once('shutdown', () => {
      for (const [name, fn] of Object.entries(handlers)) this.events.off(name, fn, this);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      this.input.keyboard?.off('keydown', onKey);
    });

    this.createUi();
    this.refreshUi();
  }

  // The window changed size: re-cover the view with the storm and re-anchor
  // the HUD (the battlefield and backdrop don't move).
  onViewResize(view) {
    this.storm.layout(view);
    this.layoutUi(view);
  }

  // HUD and buttons, laid out in art pixels after ui_mock_battle.png and
  // ui_mock_between_waves.png: wave and hull top-left, gold and Pearls
  // top-right with settings, sound and fullscreen under them, the
  // enemies-left bar top-centre during waves, and between waves the
  // Shipwright on the right and SET SAIL! / Chests / Crew along the
  // bottom (plus Wanted, where Voyage used to be). Positions are in the base
  // 480x270 layout; each group is a container that layoutUi() moves to its
  // corner or edge of the view.
  createUi() {
    const group = (...items) => this.add.container(0, 0, items);

    this.waveText = text(this, 29, 18, '', light()).setOrigin(0, 0.5);
    this.hullBar = new Bar(this, 24, 36, 92, 10, UI.colors.hull);
    this.topLeft = group(
      panel(this, 6, 6, 110, 24, 'wood'), icon(this, 19, 18, 'wave'), this.waveText,
      icon(this, 16, 41, 'hull'), this.hullBar,
    );

    this.enemiesBar = new Bar(this, 172, 12, 136, 12, UI.colors.progress);
    this.topCenter = group(this.enemiesBar);

    this.goldText = text(this, 352, 18, '', light()).setOrigin(0, 0.5);
    this.pearlsText = text(this, 428, 18, '', light()).setOrigin(0, 0.5);
    // Settings: currently just Reset progress (with a confirmation).
    this.settingsButton = new Button(this, 421, 43, {
      width: 18, height: 18, icon: 'gear', onClick: () => this.confirmReset(),
    });
    this.muteButton = new Button(this, 443, 43, {
      width: 18, height: 18, icon: 'sound_on', onClick: () => this.toggleMute(),
    });
    this.fullscreenButton = new Button(this, 465, 43, {
      width: 18, height: 18, icon: 'fullscreen', onRelease: true, onClick: () => this.toggleFullscreen(),
    }).setVisible(fullscreenSupported());
    this.topRight = group(
      panel(this, 330, 6, 144, 24, 'wood'), icon(this, 344, 18, 'gold'), this.goldText,
      icon(this, 421, 18, 'pearl'), this.pearlsText,
      this.settingsButton, this.muteButton, this.fullscreenButton,
    );

    // Over the sky between the ship and the Shipwright.
    this.banner = this.add.container(0, 0).setDepth(10).setAlpha(0);

    this.shipwright = new Shipwright(this, 0, 0, 200, this.progress, () => this.onUpgradePurchased());
    this.heroPicker = new HeroPicker(this, 0, 0, UI_KIT.pickerWidth, (id) => this.onHeroPicked(id));
    this.heroPicker.on('closed', () => {
      this.ship.selectSlot(-1);
      this.refreshUi();  // brings the Shipwright back
    });

    if (DEV_TOOLS) import('../dev/devTools.js').then((m) => m.installDevTools(this));

    this.startButton = new Button(this, 211, 246, {
      width: 120, height: 28, style: 'gold', font: 'big', label: 'SET SAIL!', onClick: () => this.startWave(),
    });
    this.packButton = new Button(this, 304, 248, {
      width: 64, height: 24, icon: 'chest', label: 'Chests', onClick: () => this.openPacks(),
    });
    this.collectionButton = new Button(this, 370, 248, {
      width: 60, height: 24, icon: 'book', label: 'Crew', onClick: () => this.openCollection(),
    });
    // The Wanted Board (red dot: a poster not opened yet).
    this.wantedButton = new Button(this, 439, 248, {
      width: 70, height: 24, icon: wantedKey('icon_wanted'), label: 'Wanted', onClick: () => this.openWanted(),
    });
    // The world map, left of SET SAIL! once an island is cleared (red dot:
    // not opened since).
    this.mapButton = new Button(this, 125, 248, {
      width: 46, height: 24, icon: mapKey('ship_token'), label: 'Map', onClick: () => this.openMap(),
    });
    // Battle speed (bottom-right, during waves): shows the current speed.
    this.speedButton = new Button(this, 452, 250, {
      width: 40, height: 22, label: '', onClick: () => this.cycleSpeed(),
    });
    // Abilities (bottom centre, during waves).
    this.abilityBar = new AbilityBar(this, {
      onTrigger: (i) => this.useAbility(i),
      onToggleAuto: () => this.toggleAutoAbilities(),
    });
    this.abilityBar.setCrew(this.heroes.map((h) => h.id));
    this.bottomBar = group(
      this.mapButton, this.startButton, this.packButton, this.collectionButton, this.wantedButton, this.speedButton,
    );
    // NEW ENEMY! alert and bounty toasts.
    this.notices = new Notices(this, this.progress);

    this.layoutUi(this.view);
  }

  // Anchor the HUD to the view: plaques to their top corners, the enemies bar
  // to the top centre, the Shipwright (and hero picker) to the right and the
  // button bar to the bottom right, under the Shipwright. (The view is the
  // game area: always 480 wide, 270 to 360 tall; see create().)
  layoutUi(view) {
    const right = view.right - DISPLAY.width;
    const center = Math.round(view.centerX - DISPLAY.width / 2);
    this.topLeft.setPosition(view.left, view.top);
    this.topCenter.setPosition(center, view.top);
    this.topRight.setPosition(right, view.top);
    this.banner.setPosition(center + 188, view.top + 80);
    this.shipwright.setPosition(right + 273, view.top + 64);
    this.heroPicker.setPosition(right + 473 - UI_KIT.pickerWidth, view.top + 64);
    this.bottomBar.setPosition(right, Math.round(view.bottom - DISPLAY.height));
    this.abilityBar.layout(view);
    this.notices.layout(view);
  }

  refreshUi() {
    const idle = this.state === STATE.IDLE;
    const p = this.progress;
    const boss = isBossWave(p.wave);
    this.waveText.setText(`WAVE ${p.wave}${boss ? ' BOSS' : ''}`);
    const waveColor = boss ? UI.colors.warn : UI.colors.text;
    if (this.waveText.color !== waveColor) this.waveText.setColor(waveColor);
    this.goldText.setText(fmtNumber(p.gold));
    this.pearlsText.setText(fmtNumber(p.pearls));
    this.hullBar.setValue(this.ship.hp / this.ship.maxHp,
      `${fmtNumber(Math.ceil(this.ship.hp))} / ${fmtNumber(this.ship.maxHp)}`);

    this.enemiesBar.setVisible(!idle);
    if (!idle) {
      const left = this.waves.queue.length + this.enemies.filter((e) => e.alive).length;
      this.enemiesBar.setValue(left / Math.max(1, this.waves.total), `${left} ENEMIES LEFT`);
    }

    for (const b of [this.startButton, this.packButton, this.collectionButton, this.wantedButton]) b.setVisible(idle);
    this.mapButton.setVisible(idle && p.mapUnlocked).setDot(!p.mapSeen);
    this.speedButton.setVisible(!idle).setLabel(`x${this.speed}`);
    this.abilityBar.setVisible(!idle);
    // Red dot: a chest is affordable.
    this.packButton.setDot(p.canOpenPack);
    this.wantedButton.setDot(p.hasUnseenPoster);
    if (this.settingsButton.enabled !== idle) this.settingsButton.setEnabled(idle);
    this.muteButton.setIcon(p.muted ? 'sound_off' : 'sound_on');
    this.fullscreenButton.setIcon(isFullscreen() ? 'windowed' : 'fullscreen');
    this.shipwright.setVisible(idle && !this.heroPicker.visible);
    this.devTools?.refresh(idle);
    if (idle) this.shipwright.refresh();
  }

  // A wood plaque with a short headline in the big font (and an optional
  // small detail line under it), fading out after hold ms.
  showBanner(title, { detail = null, color = UI.colors.text, hold = 1700 } = {}) {
    this.banner.removeAll(true);
    const label = text(this, 0, 0, title, light({ font: 'big', color })).setOrigin(0.5, 0);
    const small = detail ? text(this, 0, label.inkHeight + 5, detail, light({ font: 'small' })).setOrigin(0.5, 0) : null;
    const w = Math.max(label.inkWidth, small ? small.inkWidth : 0) + 16;
    const h = label.inkHeight + (small ? small.inkHeight + 5 : 0) + 12;
    this.banner.add([panel(this, -w / 2, -6, w, h, 'wood'), label, small].filter(Boolean));
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(1);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: hold, duration: 400 });
  }

  floatText(x, y, message, color = UI.colors.text) {
    const t = text(this, x, y, message, { font: 'small', ...light({ color }) }).setOrigin(0.5);
    // Rise through setPosition so the text stays on whole pixels.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 700,
      onUpdate: (tw) => t.setPosition(x, y - 14 * tw.getValue()).setAlpha(1 - tw.getValue()),
      onComplete: () => t.destroy(),
    });
  }

  onEnemyKilled(enemy) {
    for (const bounty of this.progress.recordDefeat(enemy.key)) this.notices.bounty(enemy.key, bounty);
    const gold = this.progress.earnGold(enemy.gold);
    const top = enemy.y - enemy.def.height / 2;
    this.floatText(enemy.x, top - 6, `+${gold}`, GOLD_TEXT);
    if (enemy.def.boss) {
      const pearls = this.progress.claimBossPearls();
      if (pearls) this.floatText(enemy.x, top - 16, `+${pearlsLabel(pearls)}`);
      // The finale: the other boss enrages.
      for (const e of this.waves.bossDown()) {
        this.showBanner(`${e.def.name.toUpperCase()} ENRAGES!`, { color: UI.colors.warn });
      }
    }
  }

  onEnemyStole(enemy) {
    const amount = Math.min(this.progress.gold, Math.ceil(this.progress.gold * enemy.def.stealPercent));
    this.progress.gold -= amount;
    this.floatText(enemy.x, enemy.y - 12, amount > 0 ? `-${amount} gold` : 'nothing to steal!', UI.colors.warn);
  }

  save() {
    saveProgress(this.progress);
  }

  confirmReset() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    new ConfirmDialog(this, {
      title: 'Reset all progress?',
      message: "Your wave, gold, Pearls, upgrades and heroes will be wiped. This can't be undone.",
      confirmLabel: 'Reset',
      onConfirm: () => {
        clearSave();
        this.scene.restart();
      },
    });
  }

  onUpgradePurchased() {
    this.ship.sync(this.progress);
    this.rebuildHeroes();
    this.refreshUi();
    this.save();
  }

  // Recreate hero objects from the slot assignments in progress.
  rebuildHeroes() {
    for (const h of this.heroes) h.destroy();
    const p = this.progress;
    const buffs = p.deckBuffs;
    this.heroes = p.activeHeroes.map(({ id, slot }) => {
      const buff = buffs[slot];
      return new Hero(this, id, this.ship.slotPosition(slot), {
        damage: p.heroDamage(id) * buff.damage,
        attackInterval: (HEROES[id].attackInterval ?? 0) / buff.attackSpeed,
        buffed: buff.buffed,
      });
    });
    this.abilities.setCrew(this.heroes, p);
    this.abilityBar?.setCrew(this.heroes.map((h) => h.id));
  }

  // Ability button or key: fires the ability of the i-th crewmate on the ship.
  useAbility(i, { fromKey = false } = {}) {
    if (this.state !== STATE.RUNNING || i >= this.heroes.length) return;
    if (fromKey) this.abilityBar.press(i);
    this.abilities.trigger(i);
  }

  // Works mid-wave; saved with progress.
  toggleAutoAbilities() {
    this.progress.autoAbilities = !this.progress.autoAbilities;
    sfx.click();
    this.abilityBar.refresh(this.abilities, this.progress.autoAbilities);
    this.save();
  }

  onSlotClicked(slot) {
    if (this.state !== STATE.IDLE) return;
    this.ship.selectSlot(slot);
    this.heroPicker.open(slot, this.progress);
    this.shipwright.setVisible(false);  // the picker takes its place
  }

  onHeroPicked(id) {
    this.progress.assignHero(this.ship.selectedSlot, id);
    this.heroPicker.close();
    this.ship.sync(this.progress);
    this.rebuildHeroes();
    this.shipwright.rebuild();  // it lists the heroes on the ship
    this.refreshUi();
    this.save();
  }

  // Owned heroes or stars changed (packs, dev toggle).
  onRosterChanged() {
    if (this.heroPicker.visible) this.heroPicker.close();
    this.shipwright.rebuild();
    this.ship.sync(this.progress);
    this.rebuildHeroes();
    this.refreshUi();
    this.save();
  }

  openCollection() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('CollectionScene', { progress: this.progress, onClose: () => this.refreshUi() });
  }

  // Works mid-wave too; the setting is saved with progress.
  toggleMute() {
    this.progress.muted = !this.progress.muted;
    sfx.setMuted(this.progress.muted);
    sfx.click();
    this.refreshUi();
    this.save();
  }

  toggleFullscreen() {
    sfx.click();
    toggleFullscreen();
  }

  openWanted() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('WantedScene', {
      progress: this.progress,
      onClose: () => {
        this.refreshUi();
        this.save();  // posters opened
      },
    });
  }

  // The world map; sailing to another island picks up its wave counter.
  openMap() {
    if (this.state !== STATE.IDLE || !this.progress.mapUnlocked) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('MapScene', {
      progress: this.progress,
      onClose: (sailed) => {
        if (sailed) this.showBanner(`SAILING TO ${this.progress.island.name.toUpperCase()}`);
        this.refreshUi();
        this.save();
      },
    });
  }

  openPacks() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('PackScene', { progress: this.progress, onClose: () => this.onRosterChanged() });
  }

  // confirmed: the player chose to set sail despite the flyer warning.
  startWave({ confirmed = false } = {}) {
    if (this.state !== STATE.IDLE) return;
    if (this.heroes.length === 0) {
      this.showBanner('ASSIGN A HERO!', { detail: 'CLICK A SLOT ON THE SHIP', color: UI.colors.warn });
      return;
    }
    if (this.heroPicker.visible) this.heroPicker.close();
    // Storm Harpies ahead and nobody on the ship can hit (or net) flyers.
    const flyers = composeWave(this.progress.wave, this.progress.waveOptions).some((s) => s.def.flies);
    if (flyers && !confirmed && !this.heroes.some((h) => h.antiAir)) {
      new ConfirmDialog(this, {
        title: 'Flyers ahead!',
        message: 'Storm Harpies fly in this wave, and none of your crew can hit flyers. Set sail anyway?',
        confirmLabel: 'Set sail',
        onConfirm: () => this.startWave({ confirmed: true }),
      });
      return;
    }
    this.ship.setSlotsEnabled(false);
    this.ship.restore();
    this.waves.start(this.progress.wave, this.progress.waveOptions);
    this.abilities.resetCooldowns();
    const { finale } = this.progress.waveOptions;
    if (finale) {
      // The island's finale: the storm rolls in under its banner.
      this.storm.start();
      this.showBanner(finale.title, { detail: finale.detail, hold: 3000 });
    } else if (isBossWave(this.progress.wave)) this.showBanner(ENEMIES[bossOf(this.progress.wave)].banner, { color: UI.colors.warn });
    else if (isSirenWave(this.progress.wave)) this.showBanner('A SIREN SINGS!', { color: UI.colors.warn });
    this.state = STATE.RUNNING;
    this.simCarry = 0;   // game time not yet simulated (under one step)
    this.waveTime = 0;   // game time simulated this wave
    this.applySpeed();
    this.refreshUi();
    this.events.emit('wave-started');
  }

  endWave(won) {
    this.state = STATE.IDLE;
    this.applySpeed();
    this.waves.stop();
    this.abilities.clear();
    for (const h of this.heroes) h.clearAbilities();
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    this.enemies = [];
    this.projectiles = [];

    this.storm.stop();
    if (won) {
      const wave = this.progress.wave;
      const { gold, pearls, finale } = this.progress.winWave();
      if (finale) {
        // The island is cleared: its reward, and the world map opens.
        sfx.reveal('legendary', true);
        this.showBanner(finale.clearedTitle, {
          detail: `+${pearlsLabel(pearls).toUpperCase()}  +${finale.legendaryChests} LEGENDARY CHEST  -  WORLD MAP UNLOCKED`,
          hold: 4500,
        });
      } else {
        this.showBanner(`WAVE ${wave} CLEARED!`, {
          detail: `+${fmtNumber(gold)} GOLD${pearls ? `  +${pearlsLabel(pearls).toUpperCase()}` : ''}`,
        });
      }
    } else {
      // Kill gold earned this wave is kept; the wave just doesn't advance.
      this.showBanner('SHIP SUNK!', { detail: 'UPGRADE AND TRY AGAIN', color: UI.colors.warn });
    }
    this.ship.restore();
    this.ship.setSlotsEnabled(true);
    this.refreshUi();
    this.save();
    this.events.emit('wave-ended', won);
  }

  cycleSpeed() {
    const speeds = DEV_TOOLS ? [...GAME_SPEEDS, DEV.extraSpeed] : GAME_SPEEDS;
    const i = speeds.indexOf(this.speed);
    this.speed = speeds[(i + 1) % speeds.length];
    sfx.click();
    this.applySpeed();
    this.refreshUi();
  }

  // Run the battle at this.speed while a wave is on, 1x otherwise: game logic
  // (via update's steps), sprite animations, tweens and timers all follow it.
  applySpeed() {
    const scale = this.state === STATE.RUNNING ? this.speed : 1;
    this.anims.globalTimeScale = scale;
    this.tweens.timeScale = scale;
    this.time.timeScale = scale;
  }

  update(_time, delta) {
    this.notices.update(Math.min(delta, 100));
    this.storm.update(Math.min(delta, 100));
    if (this.state !== STATE.RUNNING) return;
    // Fixed steps of game time, so the wave plays out the same at any frame
    // rate (see SIM in config).
    this.simCarry += Math.min(delta, SIM.maxFrameMs) * this.speed;
    while (this.simCarry >= SIM.stepMs) {
      this.simCarry -= SIM.stepMs;
      this.waveTime += SIM.stepMs;
      this.tick(SIM.stepMs);
      if (this.state !== STATE.RUNNING) return;  // the wave ended
    }
    this.refreshUi();
    this.abilityBar.refresh(this.abilities, this.progress.autoAbilities);
  }

  // One step of the battle: dt ms of game time.
  tick(dt) {
    const spawned = this.waves.update(dt);
    this.enemies.push(...spawned);
    // First sighting of a type: unlock its poster and announce it.
    for (const e of spawned) if (this.progress.discover(e.key)) this.notices.newEnemy(e.key);
    // The finale: a boss arriving after the other fell comes in enraged.
    for (const e of spawned) if (e.def.boss && e.rage > 1) this.showBanner(`${e.def.name.toUpperCase()} ENRAGES!`, { color: UI.colors.warn });
    for (const e of this.enemies) e.update(dt, this.ship);
    this.abilities.update(dt, this.progress.autoAbilities);

    for (const h of this.heroes) {
      const shot = h.update(dt, this.enemies);
      if (shot) this.projectiles.push(shot);
    }
    for (const p of this.projectiles) p.update(dt);

    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => !p.done);

    if (this.ship.isDestroyed) {
      this.endWave(false);
      return;
    }
    if (this.waves.doneSpawning && this.enemies.length === 0) this.endWave(true);
  }
}
