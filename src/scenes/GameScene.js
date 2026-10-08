import Phaser from 'phaser';
import { DISPLAY, HEROES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { Ship } from '../entities/Ship.js';
import { Hero } from '../entities/Hero.js';
import { clearSave, loadProgress, saveProgress } from '../systems/Save.js';
import { isBossWave, WaveManager } from '../systems/WaveManager.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { pearlsLabel } from '../ui/format.js';
import { HeroPicker } from '../ui/HeroPicker.js';
import { UpgradePanel } from '../ui/UpgradePanel.js';

const STATE = { IDLE: 'idle', RUNNING: 'running' };

const TEXT_STYLE = {
  fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff',
  stroke: '#000000', strokeThickness: 4,
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  // data.progress / data.prestigeRewards are passed when restarting after a
  // New Voyage, so the new run doesn't depend on re-reading storage.
  create(data = {}) {
    applyRenderScale(this);
    this.progress = data.progress ?? loadProgress();
    sfx.init(this.game);
    sfx.setMuted(this.progress.muted);
    this.state = STATE.IDLE;
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
      this.showBanner(`A new voyage begins!  +${renown} Renown  +${pearlsLabel(pearls)}`, '#80cbc4');
    }
  }

  // Open ocean: sky (the camera background), distant sea from the horizon,
  // and nearer, darker water from the waterline (groundY) where enemies wade.
  drawBackground() {
    const g = this.add.graphics();
    const horizon = 300;
    const waterY = DISPLAY.groundY;
    g.fillStyle(0x3a86b8).fillRect(0, horizon, DISPLAY.width, waterY - horizon);
    g.fillStyle(0x5aa0cc).fillRect(0, horizon, DISPLAY.width, 3);
    g.fillStyle(0x1d5f8f).fillRect(0, waterY, DISPLAY.width, DISPLAY.height - waterY);
    g.fillStyle(0x8ecae6, 0.8).fillRect(0, waterY, DISPLAY.width, 3);
    // A few wave glints.
    g.lineStyle(2, 0xbde3f5, 0.45);
    for (let i = 0; i < 26; i++) {
      const x = (i * 137) % DISPLAY.width;
      const y = horizon + 18 + ((i * 53) % (DISPLAY.height - horizon - 30));
      g.lineBetween(x, y, x + 14 + (i % 3) * 6, y);
    }
  }

  createUi() {
    this.waveText = this.add.text(16, 12, '', TEXT_STYLE);
    this.hpText = this.add.text(16, 40, '', { ...TEXT_STYLE, fontSize: '16px' });
    this.hpBar = this.add.graphics();
    this.goldText = this.add.text(DISPLAY.width - 16, 12, '', { ...TEXT_STYLE, color: '#ffd54f' })
      .setOrigin(1, 0);
    this.pearlsText = this.add.text(DISPLAY.width - 16, 38, '', { ...TEXT_STYLE, fontSize: '16px', color: '#e0f7fa' })
      .setOrigin(1, 0);

    this.banner = this.add.text(DISPLAY.width / 2, 40, '', {
      ...TEXT_STYLE, fontSize: '32px', align: 'center', wordWrap: { width: 480 },
    }).setOrigin(0.5).setAlpha(0).setDepth(10);

    this.upgradePanel = new UpgradePanel(this, 540, 70, this.progress, () => this.onUpgradePurchased());

    this.heroPicker = new HeroPicker(this, 225, 52, (id) => this.onHeroPicked(id));
    this.heroPicker.on('closed', () => {
      this.ship.selectSlot(-1);
      this.refreshUi();  // brings the upgrade panel back
    });
    this.slotHint = this.add.text(16, DISPLAY.groundY + 14, 'Click a slot to assign a hero', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    });

    if (import.meta.env.DEV) import('../dev/devTools.js').then((m) => m.installDevTools(this));

    this.startButton = new Button(this, DISPLAY.width / 2, DISPLAY.height - 40, {
      width: 180, height: 44, label: 'Start Wave', fontSize: '22px',
      onClick: () => this.startWave(),
    });
    this.packButton = new Button(this, DISPLAY.width / 2 + 190, DISPLAY.height - 40, {
      width: 160, height: 44, label: 'Chests', color: 0x8d5a17, fontSize: '20px',
      onClick: () => this.openPacks(),
    });
    // Gentle pulse while a pack is affordable.
    this.prestigeButton = new Button(this, 380, 94, {
      width: 210, height: 32, label: '', color: 0x00796b, fontSize: '15px',
      onClick: () => this.openPrestige(),
    });
    this.prestigePulse = this.tweens.add({
      targets: this.prestigeButton, scale: 1.05, duration: 600, yoyo: true, repeat: -1, paused: true,
    });
    this.collectionButton = new Button(this, DISPLAY.width / 2 - 175, DISPLAY.height - 40, {
      width: 150, height: 44, label: 'Crew', color: 0x37474f, fontSize: '18px',
      onClick: () => this.openCollection(),
    });
    this.muteButton = new Button(this, DISPLAY.width - 66, DISPLAY.height - 44, {
      width: 116, height: 22, label: '', color: 0x455a64, fontSize: '12px',
      onClick: () => this.toggleMute(),
    });
    this.resetButton = new Button(this, DISPLAY.width - 66, DISPLAY.height - 16, {
      width: 116, height: 22, label: 'Reset progress', color: 0x455a64, fontSize: '12px',
      onClick: () => this.confirmReset(),
    });
    this.packPulse = this.tweens.add({
      targets: this.packButton, scale: 1.06, duration: 500, yoyo: true, repeat: -1, paused: true,
    });
  }

  refreshUi() {
    const idle = this.state === STATE.IDLE;
    const boss = isBossWave(this.progress.wave);
    this.waveText.setText(`Wave ${this.progress.wave}${boss ? '  ·  BOSS' : ''}`)
      .setColor(boss ? '#ff8a80' : '#ffffff');
    this.goldText.setText(`Gold ${this.progress.gold}`);
    this.pearlsText.setText(`Pearls ${this.progress.pearls}`);
    this.hpText.setText(`Hull HP ${Math.ceil(this.ship.hp)} / ${this.ship.maxHp}`);

    const pct = this.ship.hp / this.ship.maxHp;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(16, 64, 200, 10);
    this.hpBar.fillStyle(pct > 0.3 ? 0x43a047 : 0xe53935).fillRect(16, 64, 200 * pct, 10);

    this.startButton.setVisible(idle);
    this.packButton.setVisible(idle);
    this.collectionButton.setVisible(idle);
    this.prestigeButton.setVisible(idle);
    const p = this.progress;
    this.prestigeButton.setLabel(p.canPrestige
      ? `New Voyage!  ✦ +${p.prestigeRewards.renown}`
      : `New Voyage  ✦ ${p.renown}`);
    if (idle && p.canPrestige) this.prestigePulse.resume();
    else { this.prestigePulse.pause(); this.prestigeButton.setScale(1); }
    this.muteButton.setLabel(`Sound: ${this.progress.muted ? 'Off' : 'On'}`);
    this.resetButton.setVisible(idle);
    this.packButton.setLabel(`Chests  (${this.progress.pearls}/${this.progress.packCost})`);
    if (idle && this.progress.canOpenPack) this.packPulse.resume();
    else { this.packPulse.pause(); this.packButton.setScale(1); }
    this.upgradePanel.setVisible(idle && !this.heroPicker.visible);
    this.slotHint.setVisible(idle);
    this.devButton?.setVisible(idle);
    this.devPearlsButton?.setVisible(idle);
    this.devWaveButton?.setVisible(idle);
    if (idle) this.upgradePanel.refresh();
  }

  // Long messages drop to a smaller size and wrap, so they stay clear of the HUD.
  showBanner(message, color) {
    const long = message.length > 34;
    this.banner.setFontSize(long ? 24 : 32).setText(message).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1500, duration: 500 });
  }

  floatText(x, y, message, color = '#ffd54f') {
    const t = this.add.text(x, y, message, { ...TEXT_STYLE, fontSize: '14px', color, strokeThickness: 3 })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  onEnemyKilled(enemy) {
    const gold = this.progress.earnGold(enemy.gold);
    const top = enemy.y - enemy.def.height / 2;
    this.floatText(enemy.x, top - 12, `+${gold}`);
    if (enemy.def.boss) {
      const pearls = this.progress.claimBossPearls();
      if (pearls) this.floatText(enemy.x, top - 32, `+${pearlsLabel(pearls)}`, '#e0f7fa');
    }
  }

  onEnemyStole(enemy) {
    const amount = Math.min(this.progress.gold, Math.ceil(this.progress.gold * enemy.def.stealPercent));
    this.progress.gold -= amount;
    this.floatText(enemy.x, enemy.y - 24, amount > 0 ? `-${amount} gold` : 'nothing to steal!', '#ff8a80');
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
        stars: p.heroStarCount(id),
        buffed: buff.buffed,
      });
    });
  }

  onSlotClicked(slot) {
    if (this.state !== STATE.IDLE) return;
    this.ship.selectSlot(slot);
    this.heroPicker.open(slot, this.progress);
    this.upgradePanel.setVisible(false);  // the picker needs the room
  }

  onHeroPicked(id) {
    this.progress.assignHero(this.ship.selectedSlot, id);
    this.heroPicker.close();
    this.ship.sync(this.progress);
    this.rebuildHeroes();
    this.upgradePanel.rebuild();  // it lists the heroes on the ship
    this.refreshUi();
    this.save();
  }

  // Owned heroes or stars changed (packs, dev toggle).
  onRosterChanged() {
    if (this.heroPicker.visible) this.heroPicker.close();
    this.upgradePanel.rebuild();
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
      this.showBanner('Assign a hero to a slot first!', '#ff8a80');
      return;
    }
    if (this.heroPicker.visible) this.heroPicker.close();
    this.ship.setSlotsEnabled(false);
    this.ship.restore();
    this.waves.start(this.progress.wave);
    if (isBossWave(this.progress.wave)) this.showBanner('The Kraken rises!', '#ff8a80');
    this.state = STATE.RUNNING;
    this.refreshUi();
  }

  endWave(won) {
    this.state = STATE.IDLE;
    this.waves.stop();
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    this.enemies = [];
    this.projectiles = [];

    if (won) {
      const gold = this.progress.earnGold(this.progress.waveClearGold());
      const pearls = this.progress.waveClearPearls();
      this.progress.pearls += pearls;
      this.showBanner(
        `Wave ${this.progress.wave} cleared!  +${gold} gold${pearls ? `  +${pearlsLabel(pearls)}` : ''}`,
        '#ffeb3b',
      );
      this.progress.advanceWave();
    } else {
      // Kill gold earned this wave is kept; the wave just doesn't advance.
      this.showBanner('The ship has sunk…', '#ff8a80');
    }
    this.ship.restore();
    this.ship.setSlotsEnabled(true);
    this.refreshUi();
    this.save();
  }

  update(_time, delta) {
    if (this.state !== STATE.RUNNING) return;
    // Clamp so a backgrounded tab doesn't teleport enemies on return.
    const dt = Math.min(delta, 100);

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
