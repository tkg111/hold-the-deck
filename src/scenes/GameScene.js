import Phaser from 'phaser';
import { DISPLAY, PACKS } from '../config.js';
import { House } from '../entities/House.js';
import { Hero } from '../entities/Hero.js';
import { Progress } from '../systems/Progress.js';
import { isBossWave, WaveManager } from '../systems/WaveManager.js';
import { Button } from '../ui/Button.js';
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

  create() {
    this.progress = new Progress();
    this.state = STATE.IDLE;
    this.enemies = [];
    this.projectiles = [];

    this.drawBackground();
    this.house = new House(this, this.progress);
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
    this.events.once('shutdown', () => {
      for (const [name, fn] of Object.entries(handlers)) this.events.off(name, fn, this);
    });

    this.createUi();
    this.refreshUi();
  }

  drawBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x6b8e3d).fillRect(0, DISPLAY.groundY, DISPLAY.width, DISPLAY.height - DISPLAY.groundY);
    g.fillStyle(0x557a2e).fillRect(0, DISPLAY.groundY, DISPLAY.width, 4);
  }

  createUi() {
    this.waveText = this.add.text(16, 12, '', TEXT_STYLE);
    this.hpText = this.add.text(16, 40, '', { ...TEXT_STYLE, fontSize: '16px' });
    this.hpBar = this.add.graphics();
    this.goldText = this.add.text(DISPLAY.width - 16, 12, '', { ...TEXT_STYLE, color: '#ffd54f' })
      .setOrigin(1, 0);
    this.angPowText = this.add.text(DISPLAY.width - 16, 38, '', { ...TEXT_STYLE, fontSize: '16px', color: '#ff8a80' })
      .setOrigin(1, 0);

    this.banner = this.add.text(DISPLAY.width / 2, 40, '', { ...TEXT_STYLE, fontSize: '32px' })
      .setOrigin(0.5).setAlpha(0).setDepth(10);

    this.upgradePanel = new UpgradePanel(this, 540, 70, this.progress, () => this.onUpgradePurchased());

    this.heroPicker = new HeroPicker(this, 225, 100, (id) => this.onHeroPicked(id));
    this.heroPicker.on('closed', () => this.house.selectSlot(-1));
    this.slotHint = this.add.text(16, DISPLAY.groundY + 14, 'Click a slot on the house to assign heroes', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    });

    if (import.meta.env.DEV) import('../dev/devTools.js').then((m) => m.installDevTools(this));

    this.startButton = new Button(this, DISPLAY.width / 2, DISPLAY.height - 40, {
      width: 180, height: 44, label: 'Start Wave', fontSize: '22px',
      onClick: () => this.startWave(),
    });
    this.packButton = new Button(this, DISPLAY.width / 2 + 190, DISPLAY.height - 40, {
      width: 160, height: 44, label: 'Packs', color: 0xb71c1c, fontSize: '20px',
      onClick: () => this.openPacks(),
    });
    // Gentle pulse while a pack is affordable.
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
    this.angPowText.setText(`Ang Pow ${this.progress.angPow}`);
    this.hpText.setText(`House HP ${Math.ceil(this.house.hp)} / ${this.house.maxHp}`);

    const pct = this.house.hp / this.house.maxHp;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(16, 64, 200, 10);
    this.hpBar.fillStyle(pct > 0.3 ? 0x43a047 : 0xe53935).fillRect(16, 64, 200 * pct, 10);

    this.startButton.setVisible(idle);
    this.packButton.setVisible(idle);
    this.packButton.setLabel(`Packs  (${this.progress.angPow}/${PACKS.cost})`);
    if (idle && this.progress.canOpenPack) this.packPulse.resume();
    else { this.packPulse.pause(); this.packButton.setScale(1); }
    this.upgradePanel.setVisible(idle);
    this.slotHint.setVisible(idle);
    this.devButton?.setVisible(idle);
    this.devAngPowButton?.setVisible(idle);
    if (idle) this.upgradePanel.refresh();
  }

  showBanner(message, color) {
    this.banner.setText(message).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1500, duration: 500 });
  }

  floatText(x, y, message, color = '#ffd54f') {
    const t = this.add.text(x, y, message, { ...TEXT_STYLE, fontSize: '14px', color, strokeThickness: 3 })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  onEnemyKilled(enemy) {
    this.progress.gold += enemy.gold;
    const top = enemy.y - enemy.def.height / 2;
    this.floatText(enemy.x, top - 12, `+${enemy.gold}`);
    if (enemy.def.boss) {
      const angPow = this.progress.claimBossAngPow();
      if (angPow) this.floatText(enemy.x, top - 32, `+${angPow} Ang Pow`, '#ff8a80');
    }
  }

  onEnemyStole(enemy) {
    const amount = Math.min(this.progress.gold, Math.ceil(this.progress.gold * enemy.def.stealPercent));
    this.progress.gold -= amount;
    this.floatText(enemy.x, enemy.y - 24, amount > 0 ? `-${amount} gold` : 'nothing to steal!', '#ff8a80');
  }

  onUpgradePurchased() {
    this.house.sync(this.progress);
    this.rebuildHeroes();
    this.refreshUi();
  }

  // Recreate hero objects from the slot assignments in progress.
  rebuildHeroes() {
    for (const h of this.heroes) h.destroy();
    this.heroes = this.progress.activeHeroes.map(({ id, slot }) =>
      new Hero(this, id, this.house.slotPosition(slot), this.progress.heroDamage(id), this.progress.heroStarCount(id)));
  }

  onSlotClicked(slot) {
    if (this.state !== STATE.IDLE) return;
    this.house.selectSlot(slot);
    this.heroPicker.open(slot, this.progress);
  }

  onHeroPicked(id) {
    this.progress.assignHero(this.house.selectedSlot, id);
    this.heroPicker.close();
    this.house.sync(this.progress);
    this.rebuildHeroes();
  }

  // Owned heroes or stars changed (packs, dev toggle).
  onRosterChanged() {
    if (this.heroPicker.visible) this.heroPicker.close();
    this.upgradePanel.rebuild();
    this.house.sync(this.progress);
    this.rebuildHeroes();
    this.refreshUi();
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
    this.house.setSlotsEnabled(false);
    this.house.restore();
    this.waves.start(this.progress.wave);
    if (isBossWave(this.progress.wave)) this.showBanner('Hantu Galah approaches!', '#ff8a80');
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
      const gold = this.progress.waveClearGold();
      const angPow = this.progress.waveClearAngPow();
      this.progress.gold += gold;
      this.progress.angPow += angPow;
      this.showBanner(
        `Wave ${this.progress.wave} cleared!  +${gold} gold${angPow ? `  +${angPow} Ang Pow` : ''}`,
        '#ffeb3b',
      );
      this.progress.wave++;
    } else {
      // Kill gold earned this wave is kept; the wave just doesn't advance.
      this.showBanner('The house has fallen…', '#ff8a80');
    }
    this.house.restore();
    this.house.setSlotsEnabled(true);
    this.refreshUi();
  }

  update(_time, delta) {
    if (this.state !== STATE.RUNNING) return;
    // Clamp so a backgrounded tab doesn't teleport enemies on return.
    const dt = Math.min(delta, 100);

    this.enemies.push(...this.waves.update(dt));
    for (const e of this.enemies) e.update(dt, this.house);

    for (const h of this.heroes) {
      const shot = h.update(dt, this.enemies);
      if (shot) this.projectiles.push(shot);
    }
    for (const p of this.projectiles) p.update(dt);

    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => !p.done);

    if (this.house.isDestroyed) {
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
