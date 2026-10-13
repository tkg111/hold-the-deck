import Phaser from 'phaser';
import {
  ASHFALL, DISPLAY, ENDING, ENEMIES, GAME_SPEEDS, HEROES, SCENERY, SIM, SNOWFALL, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { DEV_TOOLS } from '../devFlag.js';
import {
  applyRenderScale, fullscreenSupported, isFullscreen, toggleFullscreen,
} from '../display.js';
import { Scenery } from '../scenery.js';
import { createAnimations, mapKey, preloadSprites } from '../sprites.js';
import { Storm } from '../storm.js';
import { Weather } from '../weather.js';
import { Fog } from '../fog.js';
import { Ship } from '../entities/Ship.js';
import { Hero } from '../entities/Hero.js';
import { playSpawnPuff } from '../entities/Enemy.js';
import { clearSave, loadProgress, saveProgress } from '../systems/Save.js';
import { bossOf, composeWave, isBossWave, isSirenWave, WaveManager } from '../systems/WaveManager.js';
import { AbilitySystem } from '../systems/Abilities.js';
import { Volcano } from '../systems/Volcano.js';
import { Blizzard } from '../systems/Blizzard.js';
import { Mists } from '../systems/Mists.js';
import { BattleStats, mvpOf } from '../systems/BattleStats.js';
import { initParts, materialOf, PARTS_JSON_KEY } from '../systems/Parts.js';
import { ShipParts } from '../systems/ShipParts.js';
import { AbilityBar } from '../ui/AbilityBar.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { formatNum, pearlsLabel } from '../ui/format.js';
import { HeroPicker } from '../ui/HeroPicker.js';
import { Notices } from '../ui/Notices.js';
import { AutoContinue } from '../ui/AutoContinue.js';
import { ScrollPanel } from '../ui/ScrollPanel.js';
import { Shipwright } from '../ui/Shipwright.js';
import {
  Bar, EXPEDITION_JSON_KEY, expeditionKey, glyph, glyphWidth, icon, light, panel, text, UI, wantedKey,
} from '../ui/kit.js';
import * as Expeditions from '../systems/Expeditions.js';

const STATE = { IDLE: 'idle', RUNNING: 'running' };

// Enemies that count toward the wave (not hazards such as lava bombs).
const isFoe = (e) => !e.def.hazard;

// The between-waves button bar's centre line (base layout).
const BOTTOM_BAR_Y = 251;

// Gold amounts floating up from kills, and boss materials.
const GOLD_TEXT = '#ffd86a';
const MATERIAL_TEXT = '#c8ffe0';

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
    // Expedition data first: the save's expeditions are checked against it.
    Expeditions.initExpeditions(this.cache.json.get(EXPEDITION_JSON_KEY));
    initParts(this.cache.json.get(PARTS_JSON_KEY));
    this.progress = loadProgress();
    Expeditions.tick(this.progress);
    this.expeditionClock = 0;   // real ms since expeditions were last checked
    this.expeditionsReady = Expeditions.readyCount(this.progress);
    sfx.init(this.game);
    sfx.setMuted(this.progress.muted);
    this.state = STATE.IDLE;
    this.speed = this.speed ?? GAME_SPEEDS[0];  // kept across restarts in a session
    this.enemies = [];
    this.projectiles = [];

    this.scenery = new Scenery(this, this.progress.island);
    // Ember Isle's ash and Frostbite Reef's snow.
    this.ashfall = new Weather(this, ASHFALL);
    this.snowfall = new Weather(this, SNOWFALL);
    // Fogbound Isle's mist (and its fog banks).
    this.fog = new Fog(this);
    for (const w of [this.ashfall, this.snowfall, this.fog]) w.setIsland(this.progress.island, { instant: true });
    this.storm = new Storm(this);
    this.ship = new Ship(this, this.progress);
    this.heroes = [];
    this.abilities = new AbilitySystem(this);
    this.stats = new BattleStats();   // the Captain's Log, while a wave runs
    this.rebuildHeroes();

    this.waves = new WaveManager(this);
    this.volcano = new Volcano(this);   // Ember Isle's lava bombs and fire puddles
    this.blizzard = new Blizzard(this); // Frostbite Reef's blizzards
    this.mists = new Mists(this);       // Fogbound Isle's fog banks and graves
    this.shipParts = new ShipParts(this);   // the equipped ship parts' effects
    this.hunt = null;   // the Boss Hunt being fought: { boss, island, level }
    // Scene events outlive a restart, so unhook on shutdown to avoid double handlers.
    const handlers = {
      'enemy-killed': this.onEnemyKilled,
      'enemy-stole': this.onEnemyStole,
      'slot-clicked': this.onSlotClicked,
      'slot-tapped': this.onSlotTapped,
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

  // The window changed size: re-cover the view with the storm, ash, snow and
  // fog and re-anchor the HUD (the battlefield and backdrop don't move).
  onViewResize(view) {
    this.storm.layout(view);
    this.ashfall.layout(view);
    this.snowfall.layout(view);
    this.fog.layout(view);
    this.layoutUi(view);
  }

  // HUD and buttons, laid out in art pixels after ui_mock_battle.png and
  // ui_mock_between_waves.png: wave and hull top-left, gold and Pearls
  // top-right with settings, sound and fullscreen under them, the
  // enemies-left bar top-centre during waves, and between waves the
  // Shipwright on the right and the button bar along the bottom (Log, Map,
  // Voyage, SET SAIL!, Chests, Crew, Wanted). Positions are in the base
  // 480x270 layout; each group is a container that layoutUi() moves to its
  // corner or edge of the view.
  createUi() {
    const group = (...items) => this.add.container(0, 0, items);

    // Wave plaque: "FOGBOUND · WAVE 15" (see layoutWavePlaque).
    this.wavePlaque = panel(this, 6, 6, UI_KIT.hud.wave.minWidth, 24, 'wood');
    this.waveIcon = icon(this, 19, 18, 'wave');
    this.waveIsland = this.add.image(21, 18, mapKey(this.progress.islandId)).setVisible(false);
    this.islandText = text(this, 29, 18, '', light()).setOrigin(0, 0.5);
    this.waveDot = glyph(this, 0, 18, 'dot', UI.colors.text);
    this.waveText = text(this, 29, 18, '', light()).setOrigin(0, 0.5);
    // Hull HP on its own plaque under it, the bar wide enough for the widest
    // formatted HP ("88.8aa / 88.8aa").
    const hull = UI_KIT.hud.hull;
    const widest = Math.max(...['8,888', '88.8M', '88.8aa'].map((n) => {
      const t = text(this, 0, 0, `${n} / ${n}`, light({ font: 'small' }));
      const w = t.inkWidth;
      t.destroy();
      return w;
    }));
    const barW = Math.max(hull.barMin, widest + 8);
    this.hullBar = new Bar(this, 24, hull.y + 4, barW, 10, UI.colors.hull);
    this.topLeft = group(
      this.wavePlaque, this.waveIcon, this.waveIsland, this.islandText, this.waveDot, this.waveText,
      panel(this, 6, hull.y, 24 + barW + 5 - 6, hull.height, 'wood'), icon(this, 16, hull.y + 9, 'hull'), this.hullBar,
    );

    this.enemiesBar = new Bar(this, 172, 12, 136, 12, UI.colors.progress);
    this.topCenter = group(this.enemiesBar);

    // Gold and Pearls on two plaques, gold (the wider) on the left, each
    // fitting a 6-character number ("88.8aa").
    const { goldWidth, pearlsWidth, plaqueGap } = UI_KIT.hud;
    const pearlsX = 474 - pearlsWidth;
    const goldX = pearlsX - plaqueGap - goldWidth;
    this.goldText = text(this, goldX + 21, 18, '', light()).setOrigin(0, 0.5);
    this.pearlsText = text(this, pearlsX + 21, 18, '', light()).setOrigin(0, 0.5);
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
      panel(this, goldX, 6, goldWidth, 24, 'wood'), icon(this, goldX + 12, 18, 'gold'), this.goldText,
      panel(this, pearlsX, 6, pearlsWidth, 24, 'wood'), icon(this, pearlsX + 12, 18, 'pearl'), this.pearlsText,
      this.settingsButton, this.muteButton, this.fullscreenButton,
    );

    // Over the sky between the ship and the Shipwright.
    this.banner = this.add.container(0, 0).setDepth(10).setAlpha(0);

    this.shipwright = new Shipwright(this, 0, 0, this.progress, {
      onPurchase: () => this.onUpgradePurchased(),
      onSettingChange: () => this.save(),
      onOpenShipyard: () => this.openShipyard(),
    });
    this.heroPicker = new HeroPicker(this, 0, 0, UI_KIT.pickerWidth, (id) => this.onHeroPicked(id));
    this.heroPicker.on('closed', () => {
      this.ship.selectSlot(-1);
      this.refreshUi();  // brings the Shipwright back
    });

    if (DEV_TOOLS) import('../dev/devTools.js').then((m) => m.installDevTools(this));

    // The bottom bar, left to right: Log, Map, Voyage, SET SAIL!, Chests,
    // Crew, Wanted. Count badges sit in the top-right corners above the
    // labels (hence the height).
    const barY = BOTTOM_BAR_Y;
    const barH = UI_KIT.bottomButtonHeight;
    this.startButton = new Button(this, 226, barY, {
      width: 108, height: barH, style: 'gold', font: 'big', label: 'SET SAIL!', onClick: () => this.startWave(),
    });
    // Chests (badge: chests you can open, free or with Pearls).
    this.packButton = new Button(this, 314, barY, {
      width: 64, height: barH, icon: 'chest', label: 'Chests', onClick: () => this.openPacks(),
    });
    this.collectionButton = new Button(this, 376, barY, {
      width: 56, height: barH, icon: 'book', label: 'Crew', onClick: () => this.openCollection(),
    });
    // The Wanted Board (badge: posters not opened yet).
    this.wantedButton = new Button(this, 441, barY, {
      width: 70, height: barH, icon: wantedKey('icon_wanted'), label: 'Wanted', onClick: () => this.openWanted(),
    });
    // The world map, once an island is cleared (red dot: not opened since).
    this.mapButton = new Button(this, 74, barY, {
      width: 48, height: barH, icon: mapKey('ship_token'), label: 'Map', onClick: () => this.openMap(),
    });
    // The Captain's Log (battle stats of the last waves), left of Map.
    this.logButton = new Button(this, 26, barY, {
      width: 44, height: barH, icon: 'book', label: 'Log', onClick: () => this.openLog(),
    });
    // Expeditions ("Voyage"), left of SET SAIL! (badge: the ones back).
    // Greyed out until unlocked; tapping it then says how to unlock it.
    this.expeditionButton = new Button(this, 135, barY, {
      width: 70, height: barH, icon: expeditionKey('icon_expedition'), label: 'Voyage', onClick: () => this.openExpeditions(),
    });
    this.expeditionButton.bg.on('pointerdown', () => {
      if (this.expeditionButton.enabled) return;
      sfx.denied();
      this.showBanner('EXPEDITIONS', { detail: Expeditions.unlockLabel().toUpperCase() });
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
      this.logButton, this.mapButton, this.expeditionButton, this.startButton, this.packButton, this.collectionButton, this.wantedButton, this.speedButton,
    );
    // NEW ENEMY! alert and bounty toasts.
    this.notices = new Notices(this, this.progress);
    // Auto-continue toggle (bottom-left).
    this.autoContinue = new AutoContinue(this);

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
    // The Shipwright shows as many rows as fit above the button bar, and
    // slides away to the view's right edge.
    const swTop = view.top + 64;
    const barTop = Math.round(view.bottom - DISPLAY.height) + BOTTOM_BAR_Y - UI_KIT.bottomButtonHeight / 2;
    const fit = ScrollPanel.heightFor(0, UI_KIT.shipwrightHeader.height);
    const rows = Math.floor((barTop - 2 - swTop - fit) / UI_KIT.rowHeight);
    this.shipwright.setVisibleRows(Math.min(UI_KIT.shipwrightRows, rows));
    this.shipwright.setAnchor(right + 473 - UI_KIT.shipwrightWidth, view.right - 3, swTop);
    this.heroPicker.setPosition(right + 473 - UI_KIT.pickerWidth, view.top + 64);
    this.bottomBar.setPosition(right, Math.round(view.bottom - DISPLAY.height));
    this.abilityBar.layout(view);
    this.notices.layout(view);
    this.autoContinue.layout(view);
  }

  refreshUi() {
    const idle = this.state === STATE.IDLE;
    const p = this.progress;
    const boss = isBossWave(p.wave) || !!this.hunt;
    this.layoutWavePlaque(p.island, this.hunt ? `HUNT LV ${formatNum(this.hunt.level)}` : `WAVE ${formatNum(p.wave)}${boss ? ' BOSS' : ''}`);
    const waveColor = boss ? UI.colors.warn : UI.colors.text;
    if (this.waveText.color !== waveColor) this.waveText.setColor(waveColor);
    this.goldText.setText(formatNum(p.gold));
    this.pearlsText.setText(formatNum(p.pearls));
    this.hullBar.setValue(this.ship.hp / this.ship.maxHp,
      `${formatNum(Math.ceil(this.ship.hp))} / ${formatNum(this.ship.maxHp)}`);

    this.enemiesBar.setVisible(!idle);
    if (!idle) {
      const left = this.waves.queue.length + this.enemies.filter((e) => e.alive && isFoe(e)).length;
      this.enemiesBar.setValue(left / Math.max(1, this.waves.total), `${left} ENEMIES LEFT`);
    }

    for (const b of [this.startButton, this.packButton, this.collectionButton, this.wantedButton, this.logButton]) {
      b.setVisible(idle);
    }
    this.mapButton.setVisible(idle && p.mapUnlocked).setDot(!p.mapSeen);
    const expeditionsOpen = Expeditions.isUnlocked(p);
    this.expeditionButton.setVisible(idle).setBadge(expeditionsOpen ? Expeditions.readyCount(p) : 0);
    if (this.expeditionButton.enabled !== expeditionsOpen) this.expeditionButton.setEnabled(expeditionsOpen);
    this.speedButton.setVisible(!idle).setLabel(`x${this.speed}`);
    this.abilityBar.setVisible(!idle);
    // Badges: chests you can open (free ones, and with Pearls), posters
    // not opened yet.
    this.packButton.setBadge(p.freeChestCount + Math.floor(p.pearls / p.packCost));
    this.wantedButton.setBadge(p.discovered.filter((id) => !p.isPosterSeen(id)).length);
    if (this.settingsButton.enabled !== idle) this.settingsButton.setEnabled(idle);
    this.muteButton.setIcon(p.muted ? 'sound_off' : 'sound_on');
    this.fullscreenButton.setIcon(isFullscreen() ? 'windowed' : 'fullscreen');
    this.shipwright.setVisible(idle && !this.heroPicker.visible);
    this.devTools?.refresh(idle);
    if (idle) this.shipwright.refresh();
  }

  // The wave plaque: "FOGBOUND · WAVE 15" after the skull, sized to fit; if
  // that's wider than UI_KIT.hud.wave.maxWidth, the island's map art (scaled
  // down) in place of the skull and its name.
  layoutWavePlaque(island, waveLabel) {
    const key = `${island.id}|${waveLabel}`;
    if (this.wavePlaqueKey === key) return;
    this.wavePlaqueKey = key;
    const spec = UI_KIT.hud.wave;
    this.islandText.setText((island.shortName ?? island.name).toUpperCase());
    this.waveText.setText(waveLabel);
    const dotX = 29 + this.islandText.inkWidth + 4;
    const waveX = dotX + glyphWidth('dot') + 4;
    const full = waveX + this.waveText.inkWidth + 7 - 6 <= spec.maxWidth;
    this.waveIcon.setVisible(full);
    this.islandText.setVisible(full);
    this.waveDot.setVisible(full).setX(dotX);
    this.waveIsland.setVisible(!full);
    if (full) {
      this.waveText.setX(waveX);
    } else {
      this.waveIsland.setTexture(mapKey(island.id));
      this.waveIsland.setScale(spec.islandIcon / this.waveIsland.frame.width);
      this.waveText.setX(31);
    }
    const right = this.waveText.x + this.waveText.inkWidth + 7;
    this.wavePlaque.setSize(Phaser.Math.Clamp(right - 6, spec.minWidth, spec.maxWidth), 24);
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
    if (!isFoe(enemy)) return;   // a lava bomb shot down
    for (const bounty of this.progress.recordDefeat(enemy.key)) this.notices.bounty(enemy.key, bounty);
    const gold = this.progress.earnGold(this.progress.boostGold(enemy.gold));
    this.waveGold += gold;
    const top = enemy.y - enemy.def.height / 2;
    this.floatText(enemy.x, top - 6, `+${formatNum(gold)}`, GOLD_TEXT);
    // A boss in a wave pays Pearls (once per wave) and drops its material;
    // a hunt pays on winning instead.
    if (enemy.def.boss && !this.hunt) {
      const pearls = this.progress.claimBossPearls();
      if (pearls) this.floatText(enemy.x, top - 16, `+${pearlsLabel(pearls)}`);
      const drop = this.progress.bossDrop(enemy.key);
      if (drop) this.floatText(enemy.x, top - 26, `+${drop.count} ${materialOf(drop.material).name.toUpperCase()}`, MATERIAL_TEXT);
      // The finale: the other boss enrages.
      for (const e of this.waves.bossDown()) {
        this.showBanner(`${e.def.name.toUpperCase()} ENRAGES!`, { color: UI.colors.warn });
      }
    }
  }

  onEnemyStole(enemy) {
    const amount = Math.min(this.progress.gold, Math.ceil(this.progress.gold * enemy.def.stealPercent));
    this.progress.gold -= amount;
    this.floatText(enemy.x, enemy.y - 12, amount > 0 ? `-${formatNum(amount)} gold` : 'nothing to steal!', UI.colors.warn);
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

  // The Shipyard (ship parts), from the Shipwright's Parts row: parts
  // change the ship's look and the crew's speed, so both are rebuilt after.
  openShipyard() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('ShipyardScene', { progress: this.progress, onClose: () => this.onUpgradePurchased() });
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
        aura: buff.aura,
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

  // A ship slot tapped during a wave: breaks the ice on a frozen crewmate
  // there, and a charm.
  onSlotTapped(slot) {
    if (this.state !== STATE.RUNNING) return;
    this.heroes.find((h) => h.slot === slot)?.tapFree();
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

  // The Captain's Log: what the crew did in the last few waves.
  openLog() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('LogScene', { progress: this.progress, onClose: () => this.refreshUi() });
  }

  // The world map; sailing to another island picks up its wave counter.
  openMap() {
    if (this.state !== STATE.IDLE || !this.progress.mapUnlocked) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('MapScene', {
      progress: this.progress,
      openExpeditions: (onClosed) => this.openExpeditions({ onClosed }),
      onClose: (sailed, hunt = null) => {
        if (sailed) this.arriveAtIsland();
        this.refreshUi();
        this.save();
        if (hunt) this.startWave({ hunt });
      },
    });
  }

  // The Expeditions board. Sending crew empties their ship slots and
  // collecting brings them back (and gold, Pearls, chests), so the ship and
  // crew are rebuilt after. onClosed: also tell the opener (the world map).
  openExpeditions({ onClosed = null } = {}) {
    if (this.state !== STATE.IDLE || !Expeditions.isUnlocked(this.progress)) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('ExpeditionScene', {
      progress: this.progress,
      onClose: () => {
        this.expeditionsReady = Expeditions.readyCount(this.progress);
        this.onRosterChanged();
        onClosed?.();
      },
    });
  }

  // The ship has sailed to another island (the map, or the dev tools): its
  // backdrop and weather, and a banner.
  arriveAtIsland() {
    const { island } = this.progress;
    this.scenery.setIsland(island);
    this.ashfall.setIsland(island);
    this.snowfall.setIsland(island);
    this.fog.setIsland(island);
    this.showBanner(`SAILING TO ${island.name.toUpperCase()}`);
  }

  openPacks() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('PackScene', { progress: this.progress, onClose: () => this.onRosterChanged() });
  }

  // confirmed: the player chose to set sail despite the flyer warning.
  // hunt: { boss, island } for a Boss Hunt (from the map; the ship is
  // already at that island) instead of the next wave.
  startWave({ confirmed = false, hunt = null } = {}) {
    if (this.state !== STATE.IDLE) return;
    if (this.heroes.length === 0) {
      this.showBanner('ASSIGN A HERO!', { detail: 'CLICK A SLOT ON THE SHIP', color: UI.colors.warn });
      return;
    }
    if (this.heroPicker.visible) this.heroPicker.close();
    const p = this.progress;
    const options = hunt ? p.huntOptions(hunt.boss, hunt.island) : p.waveOptions;
    const wave = hunt ? options.wave : p.wave;
    // Flyers ahead (Storm Harpies, Ash Bats) and nobody on the ship can hit
    // (or net) them.
    const flyers = composeWave(wave, options).some((s) => s.def.flies);
    if (flyers && !confirmed && !this.heroes.some((h) => h.antiAir)) {
      new ConfirmDialog(this, {
        title: 'Flyers ahead!',
        message: `Flyers come in this ${hunt ? 'hunt' : 'wave'}, and none of your crew can hit them. Set sail anyway?`,
        confirmLabel: 'Set sail',
        onConfirm: () => this.startWave({ confirmed: true, hunt }),
      });
      return;
    }
    this.hunt = hunt ? { ...hunt, level: options.hunt.level } : null;
    this.ship.setSlotsEnabled(false);
    this.ship.restore();
    this.stats.start(wave, p.islandId, this.heroes);
    this.waves.start(wave, options);
    this.volcano.start(options);
    this.blizzard.start(wave, options);   // the finale's blizzard rolls in here
    this.mists.start(wave, options);      // and its fog bank
    this.shipParts.start(p);
    this.abilities.resetCooldowns();
    const { finale, island } = options;
    const boss = isBossWave(wave) ? ENEMIES[hunt ? hunt.boss : bossOf(wave, island)] : null;
    if (hunt) {
      this.showBanner(`BOSS HUNT - LV ${formatNum(this.hunt.level)}`, { detail: boss.name.toUpperCase(), color: UI.colors.warn });
    } else if (finale) {
      // The island's finale: its weather rolls in under its banner.
      if (finale.weather === 'storm') this.storm.start();
      if (finale.weather === 'eruption') this.ashfall.worsen();
      this.showBanner(finale.title, { detail: finale.detail, hold: 3000 });
    } else if (boss) {
      // Some bosses announce themselves when they arrive instead.
      if (!boss.bannerOnEntrance) this.showBanner(boss.banner, { color: UI.colors.warn });
    } else if (isSirenWave(this.progress.wave, island)) this.showBanner('A SIREN SINGS!', { color: UI.colors.warn });
    this.state = STATE.RUNNING;
    this.simCarry = 0;   // game time not yet simulated (under one step)
    this.waveTime = 0;   // game time simulated this wave
    this.waveGold = 0;   // gold earned this wave (expedition rewards are based on it)
    this.applySpeed();
    this.refreshUi();
    this.events.emit('wave-started', { hunt: !!hunt });
  }

  endWave(won) {
    this.state = STATE.IDLE;
    const { hunt } = this;
    this.hunt = null;
    // A hunt isn't a wave: it stays out of the Captain's Log and the gold
    // per minute expeditions are based on.
    const record = this.stats.finish(won);
    if (!hunt) this.progress.logWave(record);
    this.applySpeed();
    this.waves.stop();
    this.volcano.stop();
    this.blizzard.stop();
    this.mists.stop();
    this.shipParts.stop();
    this.abilities.clear();
    for (const h of this.heroes) h.clearAbilities();
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    this.enemies = [];
    this.projectiles = [];

    this.storm.stop();
    this.ashfall.calm();
    this.snowfall.calm();
    if (hunt) {
      this.endHunt(hunt, won);
    } else if (won) {
      const wave = this.progress.wave;
      const { gold, pearls, finale } = this.progress.winWave();
      this.waveGold += gold;
      this.endingDue = !!finale?.ending;
      if (finale) {
        // The island is cleared: its reward, and what it unlocks (the world
        // map, the next island).
        sfx.reveal('legendary', true);
        this.showBanner(finale.clearedTitle, {
          detail: `+${pearlsLabel(pearls).toUpperCase()}  +${finale.legendaryChests} LEGENDARY CHEST${finale.legendaryChests > 1 ? 'S' : ''}  -  ${finale.unlocks}`,
          hold: 4500,
        });
      } else {
        this.showBanner(`WAVE ${formatNum(wave)} CLEARED!`, {
          detail: `+${formatNum(gold)} GOLD${pearls ? `  +${pearlsLabel(pearls).toUpperCase()}` : ''}`,
        });
      }
    } else {
      // Kill gold earned this wave is kept; the wave just doesn't advance.
      this.showBanner('SHIP SUNK!', { detail: 'UPGRADE AND TRY AGAIN', color: UI.colors.warn });
    }
    // Won or lost, the wave's gold per minute counts toward expeditions'.
    if (!hunt) this.progress.logGold(this.waveGold, this.waveTime);
    const mvp = record && mvpOf(record);
    if (mvp) this.notices.mvp(mvp.id, mvp.damage);
    this.ship.restore();
    this.ship.setSlotsEnabled(true);
    this.refreshUi();
    this.save();
    if (this.endingDue) {
      // The last island is cleared: the ending, once the banner has shown
      // (auto-continue waits for the player).
      this.autoContinue.pause();
      this.time.delayedCall(ENDING.delayMs, () => this.playEnding());
    }
    this.events.emit('wave-ended', won, { hunt: !!hunt });
  }

  // A Boss Hunt is over: a win pays the boss's material (and a little gold)
  // and raises its hunt level; a loss costs nothing.
  endHunt(hunt, won) {
    const name = ENEMIES[hunt.boss].name.toUpperCase();
    if (!won) {
      this.showBanner('HUNT FAILED', { detail: `${name} GOT AWAY - TRY AGAIN ANY TIME`, color: UI.colors.warn });
      return;
    }
    const r = this.progress.winHunt(hunt.boss, hunt.island);
    const material = materialOf(r.material)?.name.toUpperCase() ?? '';
    sfx.loot('bonus');
    this.showBanner(`${name} HUNTED!`, {
      detail: `+${r.count} ${material}${r.doubled ? ' (2X TODAY)' : ''}  +${formatNum(r.gold)} GOLD  -  NEXT: LV ${formatNum(r.level + 1)}`,
      hold: 3500,
    });
  }

  // The ending (after Fogbound Isle's finale): the voyage across the map.
  playEnding() {
    this.endingDue = false;
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('EndingScene', { progress: this.progress, onClose: () => this.refreshUi() });
  }

  cycleSpeed() {
    const i = GAME_SPEEDS.indexOf(this.speed);
    this.speed = GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length];
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
    this.ashfall.update(Math.min(delta, 100));
    this.snowfall.update(Math.min(delta, 100));
    this.fog.update(Math.min(delta, 100));
    this.watchExpeditions(delta);
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

  // Once a second (real time), see whether an expedition has come back, for
  // the button's badge.
  watchExpeditions(delta) {
    this.expeditionClock += delta;
    if (this.expeditionClock < 1000) return;
    this.expeditionClock = 0;
    Expeditions.tick(this.progress);
    const ready = Expeditions.readyCount(this.progress);
    if (ready === this.expeditionsReady) return;
    this.expeditionsReady = ready;
    this.refreshUi();
  }

  // One step of the battle: dt ms of game time.
  tick(dt) {
    const spawned = this.waves.update(dt);
    this.enemies.push(...spawned);
    // First sighting of a type: unlock its poster and announce it.
    for (const e of spawned) if (this.progress.discover(e.key)) this.notices.newEnemy(e.key);
    // Frostbite Reef: snow puffs off the pines as each one steps out (the
    // Frost Giant shakes them itself; the Frost Wyrm flies in).
    const puff = this.progress.island.spawnPuff;
    if (puff) for (const e of spawned) if (!e.def.wyrm && !e.def.giant) playSpawnPuff(this, puff);
    // The finale: a boss arriving after the other fell comes in enraged.
    for (const e of spawned) if (e.def.boss && e.rage > 1) this.showBanner(`${e.def.name.toUpperCase()} ENRAGES!`, { color: UI.colors.warn });
    for (const e of this.enemies) e.update(dt, this.ship);
    this.volcano.update(dt);
    this.blizzard.update(dt);
    this.mists.update(dt);
    this.shipParts.update(dt);
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
    // Won once every foe is beaten (lava bombs still falling don't count).
    if (this.waves.doneSpawning && !this.enemies.some(isFoe)) this.endWave(true);
  }
}
