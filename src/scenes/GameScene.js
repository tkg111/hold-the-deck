import Phaser from 'phaser';
import {
  ABYSS, ASHFALL, DISPLAY, ENDING, ENEMIES, EXPEDITIONS, GALLEY, GAME_SPEEDS, HEROES, MOTES, PACKS, SCENERY, SIM, SNOWFALL,
  UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { DEV_TOOLS } from '../devFlag.js';
import {
  applyRenderScale, fullscreenSupported, isFullscreen, toggleFullscreen,
} from '../display.js';
import { Scenery } from '../scenery.js';
import {
  ABYSS_JSON_KEY, createAnimations, CURRENTS_KEY, DEPTH_ICON_KEY, FISHING_JSON_KEY, fishingKey, mapKey, preloadSprites,
} from '../sprites.js';
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
import { Currents } from '../systems/Currents.js';
import {
  abyssIsland, depthBosses, depthCurrents, isBossDepth, newSeed,
} from '../systems/Abyss.js';
import { BattleStats, mvpOf } from '../systems/BattleStats.js';
import { initParts, materialOf, PARTS_JSON_KEY } from '../systems/Parts.js';
import { initPacks, packOf, PACKS_JSON_KEY } from '../systems/Packs.js';
import { initFishing, mealOf } from '../systems/Fishing.js';
import { ShipParts } from '../systems/ShipParts.js';
import { Merchants } from '../systems/Merchants.js';
import { MealEffects } from '../systems/Meals.js';
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
    initPacks(this.cache.json.get(PACKS_JSON_KEY));
    initFishing(this.cache.json.get(FISHING_JSON_KEY));
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

    // The Abyss: its currents' names and effects (abyss.json), and the
    // battlefield of the depth under way or coming next (see battleIsland).
    this.abyssData = this.cache.json.get(ABYSS_JSON_KEY);
    this.depthIsland = null;
    this.scenery = new Scenery(this, this.battleIsland);
    // Ember Isle's ash and Frostbite Reef's snow, and the Abyss's motes.
    this.ashfall = new Weather(this, ASHFALL);
    this.snowfall = new Weather(this, SNOWFALL);
    this.motes = new Weather(this, MOTES);
    // Fogbound Isle's mist (and its fog banks).
    this.fog = new Fog(this);
    for (const w of this.weathers) w.setIsland(this.battleIsland, { instant: true });
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
    this.currents = new Currents(this); // the Abyss's currents
    this.shipParts = new ShipParts(this);   // the equipped ship parts' effects
    this.meals = new MealEffects(this);     // the active meal's heal
    // Passing merchant ships to plunder.
    this.merchants = new Merchants(this, {
      onPlunder: () => {
        this.refreshUi();
        this.save();
      },
    });
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
    // A pack unlocked before this session (a save from before packs).
    this.announcePacks();
    // A dive left mid-depth picks up at that depth's start.
    if (this.progress.inAbyss) this.showBanner(ABYSS.name.toUpperCase(), { detail: `BACK AT DEPTH ${formatNum(this.progress.depth)}` });
  }

  // Another scene (a menu or overlay) is open over the battle.
  get overlayOpen() {
    return this.scene.manager.getScenes(true).some((s) => s !== this);
  }

  // Every island weather (each shows where its island has its flag).
  get weathers() { return [this.ashfall, this.snowfall, this.motes, this.fog]; }

  // The battlefield (an ISLANDS entry, or the Abyss's island-shaped stand-in,
  // Abyss.abyssIsland): the island the ship is at, or during a dive the depth
  // under way (between depths, the next one, with its currents' weather).
  get battleIsland() {
    const p = this.progress;
    if (!p.inAbyss) return p.island;
    return this.depthIsland ?? abyssIsland(depthCurrents(p.abyss.run.seed, p.depth).active);
  }

  // The battlefield changed (a dive started or ended, a depth with other
  // currents): its backdrop and weather.
  showBattlefield() {
    this.depthIsland = null;
    const island = this.battleIsland;
    this.scenery.setIsland(island);
    for (const w of this.weathers) w.setIsland(island);
  }

  // The window changed size: re-cover the view with the storm, ash, snow and
  // fog and re-anchor the HUD (the battlefield and backdrop don't move).
  onViewResize(view) {
    this.storm.layout(view);
    for (const w of this.weathers) w.layout(view);
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

    // Wave plaque: "FOGBOUND · WAVE 15" (see layoutWavePlaque), or in the
    // Abyss "ABYSS · DEPTH 23" with the depth icon for the skull.
    this.wavePlaque = panel(this, 6, 6, UI_KIT.hud.wave.minWidth, 24, 'wood');
    this.waveIcon = icon(this, 19, 18, 'wave');
    this.depthIcon = this.add.image(19, 18, DEPTH_ICON_KEY).setVisible(false);
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
    // The Abyss's active currents: a row of icons under the hull plaque
    // (see layoutCurrents); tapping one shows its name and effect.
    this.currentRow = group();
    // The dive's Abyss Tide stacks, on a small plaque right of the wave
    // plaque (see layoutTide).
    this.tidePlaque = panel(this, 0, 9, 10, 18, 'wood').setVisible(false);
    this.tideText = text(this, 0, 18, '', light({ font: 'small' })).setOrigin(0, 0.5).setVisible(false);
    // Over the banner (it's anchored with the top-left group in layoutUi).
    this.currentNote = group().setVisible(false).setDepth(11);
    this.topLeft = group(
      this.wavePlaque, this.waveIcon, this.depthIcon, this.waveIsland, this.islandText, this.waveDot, this.waveText,
      panel(this, 6, hull.y, 24 + barW + 5 - 6, hull.height, 'wood'), icon(this, 16, hull.y + 9, 'hull'), this.hullBar,
      this.currentRow, this.tidePlaque, this.tideText,
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
    // The active meal: its icon and waves left, on a small plaque left of
    // the settings buttons (only while there is one).
    const mh = GALLEY.hud;
    this.mealIcon = this.add.image(mh.x + 10, mh.y + 9, fishingKey('meals'), 0);
    this.mealText = text(this, mh.x + 20, mh.y + 9, '', light({ font: 'small' })).setOrigin(0, 0.5);
    this.mealPlaque = this.add.container(0, 0, [panel(this, mh.x, mh.y, mh.width, 18, 'wood'), this.mealIcon, this.mealText]);
    this.topRight = group(
      panel(this, goldX, 6, goldWidth, 24, 'wood'), icon(this, goldX + 12, 18, 'gold'), this.goldText,
      panel(this, pearlsX, 6, pearlsWidth, 24, 'wood'), icon(this, pearlsX + 12, 18, 'pearl'), this.pearlsText,
      this.settingsButton, this.muteButton, this.fullscreenButton, this.mealPlaque,
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

    // The bottom bar, left to right: Log, Map (icons only), Voyage, Galley,
    // SET SAIL!, Chests, Crew, Wanted, each as wide as its icon and label
    // need (UI_KIT.bottomBar), from the left edge. Count badges sit in the
    // top-right corners above the labels (hence the height).
    const barY = BOTTOM_BAR_Y;
    const barH = UI_KIT.bottomButtonHeight;
    const { widths, gap, left } = UI_KIT.bottomBar;
    let barX = left;
    const slot = (key) => {
      const x = barX + Math.floor(widths[key] / 2);
      barX += widths[key] + gap;
      return x;
    };
    // The Captain's Log (battle stats of the last waves).
    this.logButton = new Button(this, slot('log'), barY, {
      width: widths.log, height: barH, icon: 'book', onClick: () => this.openLog(),
    });
    // The world map, once an island is cleared (red dot: not opened since).
    this.mapButton = new Button(this, slot('map'), barY, {
      width: widths.map, height: barH, icon: mapKey('ship_token'), onClick: () => this.openMap(),
    });
    // Expeditions ("Voyage") (badge: the ones back). Greyed out until
    // unlocked; tapping it then says how to unlock it.
    this.expeditionButton = new Button(this, slot('voyage'), barY, {
      width: widths.voyage, height: barH, icon: expeditionKey('icon_expedition'), label: 'Voyage', onClick: () => this.openExpeditions(),
    });
    // The Galley: fishing and cooking.
    this.galleyButton = new Button(this, slot('galley'), barY, {
      width: widths.galley, height: barH, icon: fishingKey('icon_pot'), label: 'Galley', onClick: () => this.openGalley(),
    });
    this.startButton = new Button(this, slot('start'), barY, {
      width: widths.start, height: barH, style: 'gold', font: 'big', label: 'SET SAIL!', onClick: () => this.startWave(),
    });
    // Chests (badge: chests you can open, free or with Pearls).
    this.packButton = new Button(this, slot('chests'), barY, {
      width: widths.chests, height: barH, icon: 'chest', label: 'Chests', onClick: () => this.openPacks(),
    });
    this.collectionButton = new Button(this, slot('crew'), barY, {
      width: widths.crew, height: barH, icon: 'crew', label: 'Crew', onClick: () => this.openCollection(),
    });
    // The Wanted Board (badge: posters not opened yet).
    this.wantedButton = new Button(this, slot('wanted'), barY, {
      width: widths.wanted, height: barH, icon: wantedKey('icon_wanted'), label: 'Wanted', onClick: () => this.openWanted(),
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
      this.logButton, this.mapButton, this.expeditionButton, this.galleyButton, this.startButton, this.packButton, this.collectionButton, this.wantedButton, this.speedButton,
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
    this.currentNote.setPosition(view.left, view.top);
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
    let boss;
    if (p.inAbyss) {
      boss = isBossDepth(p.depth);
      this.layoutWavePlaque(this.battleIsland, `DEPTH ${formatNum(p.depth)}${boss ? ' BOSS' : ''}`);
    } else {
      boss = isBossWave(p.wave) || !!this.hunt;
      this.layoutWavePlaque(p.island, this.hunt ? `HUNT LV ${formatNum(this.hunt.level)}` : `WAVE ${formatNum(p.wave)}${boss ? ' BOSS' : ''}`);
    }
    this.layoutCurrents(p.inAbyss ? depthCurrents(p.abyss.run.seed, p.depth).active : []);
    this.layoutTide(p.inAbyss ? p.abyss.run.tide : null);
    this.startButton.setLabel(p.inAbyss ? 'DIVE!' : 'SET SAIL!');
    const waveColor = boss ? UI.colors.warn : UI.colors.text;
    if (this.waveText.color !== waveColor) this.waveText.setColor(waveColor);
    this.goldText.setText(formatNum(p.gold));
    this.pearlsText.setText(formatNum(p.pearls));
    this.mealPlaque.setVisible(!!p.meal);
    if (p.meal) {
      this.mealIcon.setFrame(mealOf(p.meal.id)?.index ?? 0);
      this.mealText.setText(`${p.meal.wavesLeft} LEFT`);
    }
    this.hullBar.setValue(this.ship.hp / this.ship.maxHp,
      `${formatNum(Math.ceil(this.ship.hp))} / ${formatNum(this.ship.maxHp)}`);

    this.enemiesBar.setVisible(!idle);
    if (!idle) {
      const left = this.waves.queue.length + this.enemies.filter((e) => e.alive && isFoe(e)).length;
      this.enemiesBar.setValue(left / Math.max(1, this.waves.total), `${left} ENEMIES LEFT`);
    }

    for (const b of [this.startButton, this.packButton, this.collectionButton, this.wantedButton, this.logButton, this.galleyButton]) {
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
    this.packButton.setDot(p.unseenPacks.length > 0, { left: true });   // a new pack to look at
    this.wantedButton.setBadge(p.discovered.filter((id) => !p.isPosterSeen(id)).length);
    if (this.settingsButton.enabled !== idle) this.settingsButton.setEnabled(idle);
    this.muteButton.setIcon(p.muted ? 'sound_off' : 'sound_on');
    this.fullscreenButton.setIcon(isFullscreen() ? 'windowed' : 'fullscreen');
    this.shipwright.setVisible(idle && !this.heroPicker.visible);
    this.devTools?.refresh(idle);
    if (idle) this.shipwright.refresh();
  }

  // The wave plaque: "FOGBOUND · WAVE 15" after the skull (the Abyss: the
  // depth icon), sized to fit; if that's wider than UI_KIT.hud.wave.maxWidth,
  // the island's map art (scaled down) in place of the skull and its name.
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
    const abyss = island.id === ABYSS.id;
    this.waveIcon.setVisible(full && !abyss);
    this.depthIcon.setVisible(full && abyss);
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

  // The Abyss Tide counter ("TIDE 7", its damage bonus after it) right of
  // the wave plaque during a dive; hidden otherwise.
  layoutTide(stacks) {
    const key = `${stacks}|${this.wavePlaqueKey}`;
    if (this.tideKey === key) return;
    this.tideKey = key;
    const on = stacks != null;
    this.tidePlaque.setVisible(on);
    this.tideText.setVisible(on);
    if (!on) return;
    const x = 6 + this.wavePlaque.width + UI_KIT.hud.plaqueGap;
    this.tideText.setText(`TIDE ${formatNum(stacks)}  +${Math.round(stacks * ABYSS.tide.damage * 100)}%`).setX(x + 6);
    this.tidePlaque.setPosition(x, 9).setSize(this.tideText.inkWidth + 12, 18);
  }

  // The Abyss's current icons (abyss.json's order in currents.png) in a row
  // on a wood strip under the hull plaque; none outside a dive. Tapping one
  // shows its name and effect under the row for ABYSS.hud.noteMs.
  layoutCurrents(ids) {
    const key = ids.join(',');
    if (this.currentsKey === key) return;
    this.currentsKey = key;
    this.currentRow.removeAll(true);
    this.hideCurrentNote();
    // Bounty toasts go below the row while there is one.
    this.notices.setToastOffset(ids.length ? ABYSS.hud.iconSize + 8 : 0);
    if (!ids.length) return;
    const { iconSize, gap, y } = ABYSS.hud;
    const order = this.abyssData.currents.order.map((c) => c.id);
    const width = ids.length * (iconSize + gap) - gap + 8;
    this.currentRow.add(panel(this, 6, y, width, iconSize + 6, 'wood'));
    ids.forEach((id, i) => {
      const img = this.add.image(10 + i * (iconSize + gap), y + 3, CURRENTS_KEY, order.indexOf(id)).setOrigin(0)
        .setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => this.showCurrentNote(id));
      this.currentRow.add(img);
    });
  }

  showCurrentNote(id) {
    const c = this.abyssData.currents.order.find((o) => o.id === id);
    if (!c) return;
    sfx.click();
    const y = ABYSS.hud.y + ABYSS.hud.iconSize + 8;
    const name = text(this, 12, y + 4, c.name.toUpperCase(), light({ font: 'small', color: UI.colors.warn }));
    const effect = text(this, 12, y + 13, c.effect.toUpperCase(), light({ font: 'small', wrap: 170 }));
    const w = Math.max(name.inkWidth, effect.inkWidth) + 12;
    this.currentNote.removeAll(true);
    this.currentNote.add([panel(this, 6, y, w, effect.inkHeight + 20, 'wood'), name, effect]).setVisible(true);
    this.currentNoteTimer?.remove();
    // Real time, so it lasts as long at any battle speed.
    const started = performance.now();
    this.currentNoteTimer = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (performance.now() - started >= ABYSS.hud.noteMs) this.hideCurrentNote();
      },
    });
  }

  hideCurrentNote() {
    this.currentNoteTimer?.remove();
    this.currentNoteTimer = null;
    this.currentNote.removeAll(true);
    this.currentNote.setVisible(false);
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
    this.merchants.noteGold(gold);
    this.progress.noteDiveGold(gold);
    const top = enemy.y - enemy.def.height / 2;
    this.floatText(enemy.x, top - 6, `+${formatNum(gold)}`, GOLD_TEXT);
    // A boss in the Abyss drops double its material (and no Pearls).
    if (enemy.def.boss && this.progress.inAbyss) {
      const drop = this.progress.abyssBossDrop(enemy.key);
      if (drop) this.floatText(enemy.x, top - 16, `+${drop.count} ${materialOf(drop.material).name.toUpperCase()}`, MATERIAL_TEXT);
      return;
    }
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
        bossDamage: buff.bossDamage,
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

  // The Galley: fishing and cooking. Eating a meal changes the crew and
  // hull, so both are rebuilt after.
  openGalley() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('GalleyScene', { progress: this.progress, onClose: () => this.onUpgradePurchased() });
  }

  // The Captain's Log: what the crew did in the last few waves.
  openLog() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('LogScene', { progress: this.progress, onClose: () => this.refreshUi() });
  }

  // The world map; sailing to another island picks up its wave counter.
  // From the map's Abyss card a dive starts ({ from, seed }); during a dive,
  // sailing to an island (or a hunt) leaves the Abyss first (left).
  openMap() {
    if (this.state !== STATE.IDLE || !this.progress.mapUnlocked) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    sfx.click();
    this.scene.launch('MapScene', {
      progress: this.progress,
      openExpeditions: (onClosed) => this.openExpeditions({ onClosed }),
      onClose: (sailed, hunt = null, { dive = null, left = null } = {}) => {
        if (left) this.leftAbyss(left);
        else if (sailed) this.arriveAtIsland();
        if (dive) this.startDive(dive);
        this.refreshUi();
        this.save();
        if (hunt) this.startWave({ hunt });
      },
    });
  }

  // A dive starts at dive.from (1 or a checkpoint, which pays that depth's
  // gold) with dive.seed: the Abyss's backdrop, and a banner.
  startDive({ from, seed }) {
    const gold = this.progress.startDive(from, seed);
    if (gold == null) return;
    this.merchants.reset();
    this.showBattlefield();
    this.rebuildHeroes();   // the Tide's skipped stacks
    const { skipped, depth } = this.progress.abyss.run;
    this.showBanner(ABYSS.name.toUpperCase(), {
      detail: `${skipped ? `SKIPPED THE SHALLOWS - ` : ''}DEPTH ${formatNum(depth)}${gold ? `  +${formatNum(gold)} GOLD` : ''}`, hold: 2500,
    });
    this.refreshUi();
    this.save();
  }

  // The dive ended from the map (sailing to an island, or a hunt): back to
  // the island, saying how deep it went. summary: Progress.endDive's.
  leftAbyss(summary) {
    this.merchants.reset();
    this.showBattlefield();
    this.rebuildHeroes();   // no more Tide
    const record = summary.newRecord ? `NEW RECORD - DEPTH ${formatNum(summary.depth)}` : `LEFT AT DEPTH ${formatNum(summary.depth)}`;
    this.showBanner(`SAILING TO ${this.progress.island.name.toUpperCase()}`, { detail: record, hold: 2500 });
    if (summary.newRecord) sfx.reveal('epic', true);
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
    this.merchants.reset();
    this.showBattlefield();
    this.showBanner(`SAILING TO ${island.name.toUpperCase()}`);
  }

  openPacks() {
    if (this.state !== STATE.IDLE) return;
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('PackScene', { progress: this.progress, onClose: () => this.onRosterChanged() });
  }

  // "NEW PACK: FIRE & ICE CHEST" for a pack that has just unlocked (one at
  // a time, the next after it), once per pack; the Chests button keeps its
  // dot until the pack is looked at. after: ms to wait first (game time).
  announcePacks({ after = 0 } = {}) {
    const [id] = this.progress.unannouncedPacks;
    if (!id) return;
    const show = () => {
      this.progress.markPackAnnounced(id);
      this.save();
      sfx.reveal('epic', true);
      this.showBanner(`NEW PACK: ${packOf(id).name.toUpperCase()}`, { detail: 'OPEN IT FROM CHESTS', hold: PACKS.newPack.hold });
      this.announcePacks({ after: PACKS.newPack.hold + 400 });
    };
    if (after > 0) this.time.delayedCall(after, show);
    else show();
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
    // A depth of the Abyss plays like an island wave (options.wave) with
    // its own line-up, scaling and currents.
    const dive = p.inAbyss && !hunt;
    const options = hunt ? p.huntOptions(hunt.boss, hunt.island) : dive ? p.abyssOptions : p.waveOptions;
    const wave = hunt || dive ? options.wave : p.wave;
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
    this.stats.start(dive ? p.depth : wave, dive ? ABYSS.id : p.islandId, this.heroes);
    if (dive) {
      // The depth's battlefield: its currents' island weather.
      this.depthIsland = options.island;
      for (const w of this.weathers) w.setIsland(options.island);
    }
    this.waves.start(wave, options);
    this.volcano.start(options);
    this.blizzard.start(wave, options);   // the finale's blizzard rolls in here
    this.mists.start(wave, options);      // and its fog bank
    this.currents.start(options);
    this.shipParts.start(p);
    this.meals.start(p);
    this.abilities.resetCooldowns();
    const { finale, island } = options;
    const boss = !dive && isBossWave(wave) ? ENEMIES[hunt ? hunt.boss : bossOf(wave, island)] : null;
    if (dive) {
      this.announceDepth(options.abyss);
    } else if (hunt) {
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

  // A depth sets out: a banner for each current new at it ("CURRENT:
  // BLIZZARD"; at a dive's first depth, every one active), then the boss's
  // (those that don't announce themselves on arrival), ABYSS.hud.bossBannerDelay
  // after it if there was one.
  announceDepth({ seed, depth, currents, fresh }) {
    const run = this.progress.abyss.run;
    const news = depth === run.from ? currents : fresh;
    const names = news.map((id) => this.abyssData.currents.order.find((c) => c.id === id));
    if (names.length === 1) {
      this.showBanner(`CURRENT: ${names[0].name.toUpperCase()}`, { detail: names[0].effect.toUpperCase(), color: UI.colors.warn });
    } else if (names.length) {
      this.showBanner('CURRENTS', { detail: names.map((c) => c.name.toUpperCase()).join(' + '), color: UI.colors.warn });
    }
    if (names.length) sfx.wind();
    const boss = depthBosses(seed, depth).map((k) => ENEMIES[k]).find((def) => !def.bannerOnEntrance);
    if (!boss) return;
    const show = () => this.state === STATE.RUNNING && this.showBanner(boss.banner, { color: UI.colors.warn });
    if (names.length) this.time.delayedCall(ABYSS.hud.bossBannerDelay, show);
    else show();
  }

  endWave(won) {
    this.state = STATE.IDLE;
    const { hunt } = this;
    this.hunt = null;
    // A hunt isn't a wave: it stays out of the Captain's Log and the gold
    // per minute expeditions are based on.
    const record = this.stats.finish(won);
    if (!hunt) this.progress.logWave(record);
    const dive = this.progress.inAbyss && !hunt;
    if (dive) this.progress.noteDiveDamage(record);
    this.applySpeed();
    this.waves.stop();
    this.volcano.stop();
    this.blizzard.stop();
    this.mists.stop();
    this.currents.stop();
    this.shipParts.stop();
    this.meals.stop();
    this.abilities.clear();
    for (const h of this.heroes) h.clearAbilities();
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    this.enemies = [];
    this.projectiles = [];

    this.storm.stop();
    this.ashfall.calm();
    this.snowfall.calm();
    let summary = null;   // a dive that just ended (Progress.endDive)
    const meal = this.progress.meal?.id;
    if (hunt) {
      this.endHunt(hunt, won);
    } else if (dive) {
      summary = this.endDepth(won);
    } else if (won) {
      const wave = this.progress.wave;
      const { gold, pearls, finale } = this.progress.winWave();
      this.waveGold += gold;
      this.merchants.noteGold(gold);
      this.endingDue = !!finale?.ending;
      if (finale) {
        // The island is cleared: its reward, and what it unlocks (the world
        // map, the next island).
        sfx.reveal('legendary', true);
        this.showBanner(finale.clearedTitle, {
          detail: `+${pearlsLabel(pearls).toUpperCase()}  +${finale.legendaryChests} LEGENDARY CHEST${finale.legendaryChests > 1 ? 'S' : ''}  -  ${finale.unlocks}`,
          hold: 4500,
        });
        // ...and a pack it unlocks, after that banner.
        this.announcePacks({ after: PACKS.newPack.afterFinale });
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
    // The meal ran out with this win: the crew and hull without it.
    if (meal && !this.progress.meal) {
      this.ship.sync(this.progress);
      this.rebuildHeroes();
    }
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
    this.events.emit('wave-ended', won, { hunt: !!hunt, diveOver: !!summary });
    // The dive is over: its end-of-run screen once the banner has shown
    // (auto-continue waits for the player).
    if (summary) {
      this.autoContinue.pause();
      this.time.delayedCall(ABYSS.endScreenDelay, () => this.showDiveEnd(summary));
    }
  }

  // A depth of the Abyss is over. Won: its clear bonus and first-clear
  // milestone, on to the next depth (and its currents' weather). Lost: the
  // dive ends; returns its summary (Progress.endDive) for the end-of-run
  // screen.
  endDepth(won) {
    const p = this.progress;
    if (!won) {
      const summary = p.endDive();
      sfx.denied();
      this.showBanner(summary.newRecord ? `NEW RECORD - DEPTH ${formatNum(summary.depth)}` : 'SHIP SUNK!', {
        detail: `THE ABYSS TOOK YOU AT DEPTH ${formatNum(summary.depth)}`, color: summary.newRecord ? UI.colors.text : UI.colors.warn,
      });
      this.merchants.reset();
      this.showBattlefield();
      this.rebuildHeroes();   // no more Tide
      return summary;
    }
    const { depth, gold, milestone } = p.winDepth();
    this.rebuildHeroes();   // one more Tide stack
    this.waveGold += gold;
    this.merchants.noteGold(gold);
    const parts = [`+${formatNum(gold)} GOLD`];
    if (milestone) {
      sfx.reveal('legendary', true);
      for (const [tier, n] of Object.entries(milestone.chests)) {
        const { label } = EXPEDITIONS.chests[tier];
        parts.push(`+${n > 1 ? `${n} ` : ''}${label.toUpperCase()}${n > 1 ? 'S' : ''}`);
      }
      if (milestone.pearls) parts.push(`+${pearlsLabel(milestone.pearls).toUpperCase()}`);
    }
    this.showBanner(`DEPTH ${formatNum(depth)} CLEARED!`, { detail: parts.join('  '), hold: milestone ? 3500 : 1700 });
    this.showBattlefield();
    return null;
  }

  // The end-of-run screen (AbyssEndScene): Dive again starts a new dive from
  // the same depth (or the deepest checkpoint below it still open); Map
  // takes the ship back to its island and opens the map.
  showDiveEnd(summary) {
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('AbyssEndScene', {
      progress: this.progress,
      summary,
      onDiveAgain: () => {
        const open = this.progress.abyssCheckpoints.filter((d) => d <= summary.from);
        this.startDive({ from: open[open.length - 1], seed: newSeed() });
      },
      onMap: () => {
        this.refreshUi();
        this.openMap();
      },
    });
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
  // Its Continue then opens the map, which reveals the Abyss (once).
  playEnding() {
    this.endingDue = false;
    if (this.heroPicker.visible) this.heroPicker.close();
    this.scene.launch('EndingScene', {
      progress: this.progress,
      onClose: () => {
        this.refreshUi();
        if (this.progress.abyssUnlocked && !this.progress.abyss.revealed) this.openMap();
      },
    });
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
    // A merchant sails on at the battle's speed (1x between waves).
    this.merchants.update(Math.min(delta, 100) * this.time.timeScale);
    this.storm.update(Math.min(delta, 100));
    for (const w of this.weathers) w.update(Math.min(delta, 100));
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
    const puff = this.battleIsland.spawnPuff;
    if (puff) for (const e of spawned) if (!e.def.wyrm && !e.def.giant) playSpawnPuff(this, puff);
    // The finale: a boss arriving after the other fell comes in enraged.
    for (const e of spawned) if (e.def.boss && e.rage > 1) this.showBanner(`${e.def.name.toUpperCase()} ENRAGES!`, { color: UI.colors.warn });
    for (const e of this.enemies) e.update(dt, this.ship);
    this.volcano.update(dt);
    this.blizzard.update(dt);
    this.mists.update(dt);
    this.currents.update(dt);
    this.shipParts.update(dt);
    this.meals.update(dt);
    this.abilities.update(dt, this.progress.autoAbilities);
    // Merchants: not in a hunt, nor while a boss is alive or an overlay is open.
    if (!this.hunt) {
      const bossAlive = this.enemies.some((e) => e.alive && e.def.boss);
      this.merchants.tick(dt, { canSail: !bossAlive && !this.overlayOpen, bossAlive });
    }

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
