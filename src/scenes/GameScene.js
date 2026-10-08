import Phaser from 'phaser';
import { DISPLAY } from '../config.js';
import { House } from '../entities/House.js';
import { Hero } from '../entities/Hero.js';
import { Progress } from '../systems/Progress.js';
import { isBossWave, WaveManager } from '../systems/WaveManager.js';
import { Button } from '../ui/Button.js';
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

    // Budak Lastik is fixed in slot 0. Slot assignment comes in step 4.
    this.heroes = [
      new Hero(this, 'budakLastik', this.house.slotPosition(0), this.progress.heroDamage('budakLastik')),
    ];

    this.waves = new WaveManager(this);
    // Scene events outlive a restart, so unhook on shutdown to avoid double handlers.
    this.events.on('enemy-killed', this.onEnemyKilled, this);
    this.events.on('enemy-stole', this.onEnemyStole, this);
    this.events.once('shutdown', () => {
      this.events.off('enemy-killed', this.onEnemyKilled, this);
      this.events.off('enemy-stole', this.onEnemyStole, this);
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

    this.banner = this.add.text(DISPLAY.width / 2, 40, '', { ...TEXT_STYLE, fontSize: '32px' })
      .setOrigin(0.5).setAlpha(0).setDepth(10);

    this.upgradePanel = new UpgradePanel(this, 540, 70, this.progress, () => this.onUpgradePurchased());

    this.startButton = new Button(this, DISPLAY.width / 2, DISPLAY.height - 40, {
      width: 180, height: 44, label: 'Start Wave', fontSize: '22px',
      onClick: () => this.startWave(),
    });
  }

  refreshUi() {
    const idle = this.state === STATE.IDLE;
    const boss = isBossWave(this.progress.wave);
    this.waveText.setText(`Wave ${this.progress.wave}${boss ? '  ·  BOSS' : ''}`)
      .setColor(boss ? '#ff8a80' : '#ffffff');
    this.goldText.setText(`Gold ${this.progress.gold}`);
    this.hpText.setText(`House HP ${Math.ceil(this.house.hp)} / ${this.house.maxHp}`);

    const pct = this.house.hp / this.house.maxHp;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(16, 64, 200, 10);
    this.hpBar.fillStyle(pct > 0.3 ? 0x43a047 : 0xe53935).fillRect(16, 64, 200 * pct, 10);

    this.startButton.setVisible(idle);
    this.upgradePanel.setVisible(idle);
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
    this.floatText(enemy.x, enemy.y - enemy.def.height / 2 - 12, `+${enemy.gold}`);
  }

  onEnemyStole(enemy) {
    const amount = Math.min(this.progress.gold, Math.ceil(this.progress.gold * enemy.def.stealPercent));
    this.progress.gold -= amount;
    this.floatText(enemy.x, enemy.y - 24, amount > 0 ? `-${amount} gold` : 'nothing to steal!', '#ff8a80');
  }

  onUpgradePurchased() {
    this.house.sync(this.progress);
    for (const h of this.heroes) h.damage = this.progress.heroDamage(h.id);
    this.refreshUi();
  }

  startWave() {
    if (this.state !== STATE.IDLE) return;
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
      const reward = this.progress.waveClearGold();
      this.progress.gold += reward;
      this.showBanner(`Wave ${this.progress.wave} cleared!  +${reward} gold`, '#ffeb3b');
      this.progress.wave++;
    } else {
      // Kill gold earned this wave is kept; the wave just doesn't advance.
      this.showBanner('The house has fallen…', '#ff8a80');
    }
    this.house.restore();
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
