import Phaser from 'phaser';
import { DISPLAY, GAME_SPEEDS, HEROES, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import {
  applyRenderScale, fullscreenSupported, isFullscreen, toggleFullscreen,
} from '../display.js';
import { LAYOUT, shiftIsland } from '../layout.js';
import { Scenery } from '../scenery.js';
import { createAnimations, preloadSprites } from '../sprites.js';
import { Ship } from '../entities/Ship.js';
import { Hero } from '../entities/Hero.js';
import { clearSave, loadProgress, saveProgress } from '../systems/Save.js';
import { composeWave, isBossWave, isSirenWave, WaveManager } from '../systems/WaveManager.js';
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
    // The battle fills the window from the bottom-left: the ship stays there,
    // the island moves out to the right edge, extra height is sky.
    applyRenderScale(this, { x: 0, y: 1 });
    createAnimations(this);
    shiftIsland(this.view.width - DISPLAY.width);
    this.progress = loadProgress();
    sfx.init(this.game);
    sfx.setMuted(this.progress.muted);
    this.state = STATE.IDLE;
    this.speed = this.speed ?? GAME_SPEEDS[0];  // kept across restarts in a session
    this.enemies = [];
    this.projectiles = [];

    this.scenery = new Scenery(this);
    this.scenery.layout(this.view);
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

  // The window changed size: move the island (and enemies on their way from
  // it) and re-anchor the HUD.
  onViewResize(view) {
    const oldSpawnX = LAYOUT.enemySpawnX;
    shiftIsland(view.width - DISPLAY.width);
    this.scenery.layout(view);
    for (const e of this.enemies) e.rescaleLane(oldSpawnX, LAYOUT.enemySpawnX);
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

    if (import.meta.env.DEV) import('../dev/devTools.js').then((m) => m.installDevTools(this));

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
      this.startButton, this.packButton, this.collectionButton, this.wantedButton, this.speedButton,
    );
    // NEW ENEMY! alert and bounty toasts.
    this.notices = new Notices(this, this.progress);

    this.layoutUi(this.view);
  }

  // Anchor the HUD to the view: plaques to their top corners, the enemies bar
  // to the top centre, the Shipwright (and hero picker) to the right and the
  // button bar to the bottom right, under the Shipwright. (The view's left
  // and bottom edges are the base layout's; see create().)
  layoutUi(view) {
    const right = view.right - DISPLAY.width;
    const center = Math.round(view.centerX - DISPLAY.width / 2);
    this.topLeft.setPosition(view.left, view.top);
    this.topCenter.setPosition(center, view.top);
    this.topRight.setPosition(right, view.top);
    this.banner.setPosition(188 + Math.round((view.width - DISPLAY.width) / 2), view.top + 80);
    this.shipwright.setPosition(right + 273, view.top + 64);
    this.heroPicker.setPosition(right + 473 - UI_KIT.pickerWidth, view.top + 64);
    this.bottomBar.setPosition(right, view.bottom - DISPLAY.height);
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
    this.speedButton.setVisible(!idle).setLabel(`x${this.speed}`);
    this.abilityBar.setVisible(!idle);
    // Red dot: a chest is affordable.
    this.packButton.setDot(p.canOpenPack);
    this.wantedButton.setDot(p.hasUnseenPoster);
    if (this.settingsButton.enabled !== idle) this.settingsButton.setEnabled(idle);
    this.muteButton.setIcon(p.muted ? 'sound_off' : 'sound_on');
    this.fullscreenButton.setIcon(isFullscreen() ? 'windowed' : 'fullscreen');
    this.shipwright.setVisible(idle && !this.heroPicker.visible);
    this.devButton?.setVisible(idle);
    this.devPearlsButton?.setVisible(idle);
    this.devWaveButton?.setVisible(idle);
    if (idle) this.shipwright.refresh();
  }

  // A wood plaque with a short headline in the big font (and an optional
  // small detail line under it), fading out.
  showBanner(title, { detail = null, color = UI.colors.text } = {}) {
    this.banner.removeAll(true);
    const label = text(this, 0, 0, title, light({ font: 'big', color })).setOrigin(0.5, 0);
    const small = detail ? text(this, 0, label.inkHeight + 5, detail, light({ font: 'small' })).setOrigin(0.5, 0) : null;
    const w = Math.max(label.inkWidth, small ? small.inkWidth : 0) + 16;
    const h = label.inkHeight + (small ? small.inkHeight + 5 : 0) + 12;
    this.banner.add([panel(this, -w / 2, -6, w, h, 'wood'), label, small].filter(Boolean));
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(1);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1700, duration: 400 });
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
    const flyers = composeWave(this.progress.wave).some((s) => s.def.flies);
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
    this.waves.start(this.progress.wave);
    this.abilities.resetCooldowns();
    if (isBossWave(this.progress.wave)) this.showBanner('THE KRAKEN RISES!', { color: UI.colors.warn });
    else if (isSirenWave(this.progress.wave)) this.showBanner('A SIREN SINGS!', { color: UI.colors.warn });
    this.state = STATE.RUNNING;
    this.applySpeed();
    this.refreshUi();
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

    if (won) {
      const gold = this.progress.earnGold(this.progress.waveClearGold());
      const pearls = this.progress.waveClearPearls();
      this.progress.pearls += pearls;
      this.showBanner(`WAVE ${this.progress.wave} CLEARED!`, {
        detail: `+${fmtNumber(gold)} GOLD${pearls ? `  +${pearlsLabel(pearls).toUpperCase()}` : ''}`,
      });
      this.progress.advanceWave();
    } else {
      // Kill gold earned this wave is kept; the wave just doesn't advance.
      this.showBanner('SHIP SUNK!', { detail: 'UPGRADE AND TRY AGAIN', color: UI.colors.warn });
    }
    this.ship.restore();
    this.ship.setSlotsEnabled(true);
    this.refreshUi();
    this.save();
  }

  cycleSpeed() {
    const i = GAME_SPEEDS.indexOf(this.speed);
    this.speed = GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length];
    sfx.click();
    this.applySpeed();
    this.refreshUi();
  }

  // Run the battle at this.speed while a wave is on, 1x otherwise: game logic
  // (via update's dt), sprite animations, tweens and timers all follow it.
  applySpeed() {
    const scale = this.state === STATE.RUNNING ? this.speed : 1;
    this.anims.globalTimeScale = scale;
    this.tweens.timeScale = scale;
    this.time.timeScale = scale;
  }

  update(_time, delta) {
    this.scenery.syncForeground();
    this.notices.update(Math.min(delta, 100));
    if (this.state !== STATE.RUNNING) return;
    // Clamp so a backgrounded tab doesn't teleport enemies on return.
    const dt = Math.min(delta, 100) * this.speed;

    const spawned = this.waves.update(dt);
    this.enemies.push(...spawned);
    // First sighting of a type: unlock its poster and announce it.
    for (const e of spawned) if (this.progress.discover(e.key)) this.notices.newEnemy(e.key);
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
    if (this.waves.doneSpawning && this.enemies.length === 0) {
      this.endWave(true);
      return;
    }
    this.refreshUi();
    this.abilityBar.refresh(this.abilities, this.progress.autoAbilities);
  }
}
