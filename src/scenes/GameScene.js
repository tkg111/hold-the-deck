import Phaser from 'phaser';
import { GAME_SPEEDS, HEROES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import {
  BACKGROUND_KEY, createAnimations, FOREGROUND_ANIM, FOREGROUND_KEY, preloadSprites,
} from '../sprites.js';
import { DEPTH, Ship } from '../entities/Ship.js';
import { Hero } from '../entities/Hero.js';
import { clearSave, loadProgress, saveProgress } from '../systems/Save.js';
import { isBossWave, WaveManager } from '../systems/WaveManager.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { fmtNumber, pearlsLabel } from '../ui/format.js';
import { HeroPicker } from '../ui/HeroPicker.js';
import { Shipwright } from '../ui/Shipwright.js';
import { Bar, icon, light, panel, text, UI } from '../ui/kit.js';

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

  // data.progress / data.prestigeRewards are passed when restarting after a
  // New Voyage, so the new run doesn't depend on re-reading storage.
  create(data = {}) {
    applyRenderScale(this);
    createAnimations(this);
    this.progress = data.progress ?? loadProgress();
    sfx.init(this.game);
    sfx.setMuted(this.progress.muted);
    this.state = STATE.IDLE;
    this.speed = this.speed ?? GAME_SPEEDS[0];  // kept across restarts in a session
    this.enemies = [];
    this.projectiles = [];

    this.drawBackground();
    this.ship = new Ship(this, this.progress);
    this.heroes = [];
    this.rebuildHeroes();

    this.waves = new WaveManager(this);
    // Scene events outlive a restart, so unhook on shutdown to avoid double handlers.
    const handlers = {
      'enemy-killed': this.onEnemyKilled,
      'enemy-stole': this.onEnemyStole,
      'slot-clicked': this.onSlotClicked,
    };
    for (const [name, fn] of Object.entries(handlers)) this.events.on(name, fn, this);
    // Also save when the tab is hidden or closed, so kill gold from an
    // unfinished wave isn't lost (same as losing a wave: gold is kept).
    const onPageHide = () => this.save();
    window.addEventListener('pagehide', onPageHide);
    this.events.once('shutdown', () => {
      for (const [name, fn] of Object.entries(handlers)) this.events.off(name, fn, this);
      window.removeEventListener('pagehide', onPageHide);
    });

    this.createUi();
    this.refreshUi();
    if (data.prestigeRewards) {
      const { renown, pearls } = data.prestigeRewards;
      this.showBanner('NEW VOYAGE!', { detail: `+${renown} RENOWN  +${pearlsLabel(pearls).toUpperCase()}` });
    }
  }

  // The battle scene: bg.png behind everything, and the animated foreground
  // (near water and island) over the enemies so they wade into the sea.
  drawBackground() {
    this.add.image(0, 0, BACKGROUND_KEY).setOrigin(0).setDepth(DEPTH.background);
    this.add.sprite(0, 0, FOREGROUND_KEY).setOrigin(0)
      .setDepth(DEPTH.foreground).play(FOREGROUND_ANIM);
  }

  // HUD and buttons, laid out in art pixels after ui_mock_battle.png and
  // ui_mock_between_waves.png: wave and hull top-left, gold and Pearls
  // top-right with settings and sound under them, the enemies-left bar
  // top-centre during waves, and between waves the Shipwright on the right and
  // SET SAIL! / Chests / Crew / Voyage along the bottom.
  createUi() {
    panel(this, 6, 6, 110, 24, 'wood');
    icon(this, 19, 18, 'wave');
    this.waveText = text(this, 29, 18, '', light()).setOrigin(0, 0.5);
    icon(this, 16, 41, 'hull');
    this.hullBar = new Bar(this, 24, 36, 92, 10, UI.colors.hull);

    this.enemiesBar = new Bar(this, 172, 12, 136, 12, UI.colors.progress);

    panel(this, 330, 6, 144, 24, 'wood');
    icon(this, 344, 18, 'gold');
    this.goldText = text(this, 352, 18, '', light()).setOrigin(0, 0.5);
    icon(this, 421, 18, 'pearl');
    this.pearlsText = text(this, 428, 18, '', light()).setOrigin(0, 0.5);
    // Settings: currently just Reset progress (with a confirmation).
    this.settingsButton = new Button(this, 443, 43, {
      width: 18, height: 18, icon: 'gear', onClick: () => this.confirmReset(),
    });
    this.muteButton = new Button(this, 465, 43, {
      width: 18, height: 18, icon: 'sound_on', onClick: () => this.toggleMute(),
    });

    // Over the sky between the ship and the Shipwright.
    this.banner = this.add.container(188, 80).setDepth(10).setAlpha(0);

    this.shipwright = new Shipwright(this, 273, 64, 200, this.progress, () => this.onUpgradePurchased());
    this.heroPicker = new HeroPicker(this, 273, 64, 200, (id) => this.onHeroPicked(id));
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
    // Battle speed (bottom-right, during waves): shows the current speed.
    this.speedButton = new Button(this, 452, 250, {
      width: 40, height: 22, label: '', onClick: () => this.cycleSpeed(),
    });
    this.prestigeButton = new Button(this, 439, 248, {
      width: 70, height: 24, icon: 'renown', label: 'Voyage', onClick: () => this.openPrestige(),
    });
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

    for (const b of [this.startButton, this.packButton, this.collectionButton, this.prestigeButton]) b.setVisible(idle);
    this.speedButton.setVisible(!idle).setLabel(`x${this.speed}`);
    // Red dots: a chest is affordable / a new voyage is available.
    this.packButton.setDot(p.canOpenPack);
    this.prestigeButton.setDot(p.canPrestige);
    if (this.settingsButton.enabled !== idle) this.settingsButton.setEnabled(idle);
    this.muteButton.setIcon(p.muted ? 'sound_off' : 'sound_on');
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

  openPrestige() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('PrestigeScene', {
      progress: this.progress,
      // Shop bonuses change damage, gold and ship HP right away.
      onChange: () => this.onUpgradePurchased(),
      onClose: () => this.refreshUi(),
      onPrestige: (rewards) => {
        this.save();
        this.scene.restart({ progress: this.progress, prestigeRewards: rewards });
      },
    });
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

  openPacks() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('PackScene', { progress: this.progress, onClose: () => this.onRosterChanged() });
  }

  startWave() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroes.length === 0) {
      this.showBanner('ASSIGN A HERO!', { detail: 'CLICK A SLOT ON THE SHIP', color: UI.colors.warn });
      return;
    }
    if (this.heroPicker.visible) this.heroPicker.close();
    this.ship.setSlotsEnabled(false);
    this.ship.restore();
    this.waves.start(this.progress.wave);
    if (isBossWave(this.progress.wave)) this.showBanner('THE KRAKEN RISES!', { color: UI.colors.warn });
    this.state = STATE.RUNNING;
    this.applySpeed();
    this.refreshUi();
  }

  endWave(won) {
    this.state = STATE.IDLE;
    this.applySpeed();
    this.waves.stop();
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
    if (this.state !== STATE.RUNNING) return;
    // Clamp so a backgrounded tab doesn't teleport enemies on return.
    const dt = Math.min(delta, 100) * this.speed;

    this.enemies.push(...this.waves.update(dt));
    for (const e of this.enemies) e.update(dt, this.ship);

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
  }
}
