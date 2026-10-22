import Phaser from 'phaser';
import {
  DISPLAY, FISHING, GALLEY, MEALS, SCENERY, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { LAYOUT } from '../layout.js';
import {
  FISHING_JSON_KEY, fishingKey, sceneryKeys, shipFrontKey, shipStageKey,
} from '../sprites.js';
import { traitOf } from '../systems/Expeditions.js';
import {
  FISH_DATA, fishingSpots, fishOf, hitsToLand, iconFrame, itemFrame, mealEffectLines, mealFish, mealOf, reelSpec,
  rollFish, rollRarity,
} from '../systems/Fishing.js';
import { overlayKey, PART_DATA, partOf } from '../systems/Parts.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { fmtClock, formatNum } from '../ui/format.js';
import {
  dark, glyph, hexColor, light, nineSlice, panel, subText, text, UI,
} from '../ui/kit.js';

const TABS = [
  { key: 'fishing', label: 'Fishing' },
  { key: 'cooking', label: 'Cooking' },
];

// The fishing minigame's states.
const S = {
  IDLE: 'idle', CASTING: 'casting', WAITING: 'waiting', BITE: 'bite', REELING: 'reeling', DONE: 'done',
};

// The angler's sheet frame -> its rod tip in fishing.json (frame-local).
const TIP_OF_FRAME = ['idle0', 'idle1', 'cast0', 'cast1', 'wait', 'tug', 'hold'];

// The Galley: fishing and cooking, two tabs. Fishing shows a spot's battle
// backdrop (the islands reached, and the Abyss once open) with the ship as
// it is and the angler in deck 1's forward slot, no crew, enemies or
// hazards; a cast costs a Bait (FISHING). Cooking turns fish and Spice into
// meals. Launched over GameScene with { progress, onClose }.
export class GalleyScene extends Phaser.Scene {
  constructor() {
    super('GalleyScene');
    this.tab = TABS[0].key;   // kept between openings
    this.spotId = null;
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
  }

  create() {
    // Laid out like the battle: the backdrop's battlefield fills the view
    // the same way (more sky above, more sea below).
    applyRenderScale(this, { y: SCENERY.skyShare });
    this.json = this.cache.json.get(FISHING_JSON_KEY);
    // Blocks clicks to the battle underneath; taps on the scene fish.
    this.backdrop = fillView(this, 0x0d1117, 1).setDepth(-100);
    this.backdrop.on('pointerdown', () => this.onTap());
    this.input.keyboard?.on('keydown-SPACE', () => this.onTap());
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown-SPACE'));

    const spots = fishingSpots(this.progress);
    const here = this.progress.inAbyss ? 'abyss' : this.progress.islandId;
    if (!spots.some((s) => s.id === this.spotId)) this.spotId = spots.some((s) => s.id === here) ? here : spots[0].id;

    this.createWorld();
    this.createUi();
    this.state = S.IDLE;
    this.timers = [];
    this.select(this.tab, { quiet: true });
    this.events.on('view-resize', (view) => this.layoutUi(view));
    this.layoutUi(this.view);
  }

  // --- The scene ---

  createWorld() {
    const p = this.progress;
    const ship = { x: LAYOUT.shipX, y: LAYOUT.shipY };
    this.bg = this.add.image(0, -SCENERY.originY, '__DEFAULT').setOrigin(0);
    this.shipImg = this.add.image(ship.x, ship.y, shipStageKey(p.decks)).setOrigin(0);
    // The equipped parts on the ship, as in battle.
    const slot = (id) => PART_DATA.slots.indexOf(partOf(id).slot);
    for (const id of Object.keys(p.equippedLevels).filter((i) => partOf(i)).sort((a, b) => slot(a) - slot(b))) {
      const key = overlayKey(partOf(id), p.decks);
      if (this.textures.exists(key)) this.add.image(ship.x, ship.y, key).setOrigin(0);
    }
    this.angler = this.add.sprite(ship.x + FISHING.angler.x, ship.y + FISHING.angler.y, fishingKey('angler'), 0).setOrigin(0);
    this.idle();
    this.fg = this.add.sprite(0, 0, '__DEFAULT').setOrigin(0);
    this.front = this.add.image(0, 0, '__DEFAULT').setOrigin(0);
    this.add.image(ship.x, ship.y, shipFrontKey(p.decks)).setOrigin(0);
    // Over the railing: the line, the bobber and its splashes, the "!" and a
    // fish held up.
    this.line = this.add.graphics();
    this.bobber = this.add.sprite(0, 0, fishingKey('bobber'), 0).setOrigin(0).setVisible(false);
    this.alert = this.add.image(this.angler.x + 16, this.angler.y + 1, fishingKey('alert')).setOrigin(0.5, 1).setVisible(false);
    const hold = FISHING.holdFish;
    this.heldFish = this.add.image(this.angler.x + hold.x, this.angler.y + hold.y, fishingKey('fish'), 0)
      .setScale(hold.scale).setVisible(false);
    this.showSpot();
  }

  // The chosen spot's backdrop: its background, foreground loop and front
  // layer (the battle's, without its weather or hazards).
  showSpot() {
    const spot = fishingSpots(this.progress).find((s) => s.id === this.spotId);
    const keys = sceneryKeys(spot.island);
    this.bg.setTexture(keys.bg);
    this.fg.setTexture(keys.fg).play(keys.anim);
    this.front.setVisible(!!keys.front);
    if (keys.front) this.front.setTexture(keys.front);
  }

  // The angler's rod tip now (world pixels), or null (holding a fish up).
  get rodTip() {
    const tip = this.json.angler.rod_tip[TIP_OF_FRAME[this.angler.frame.name]];
    return tip ? { x: this.angler.x + tip[0], y: this.angler.y + tip[1] } : null;
  }

  idle() {
    this.angler.play(`${fishingKey('angler')}_idle`);
  }

  pose(name) {
    this.angler.stop().setFrame(this.json.angler.anims[name][0]);
  }

  // --- UI ---

  createUi() {
    const cx = DISPLAY.width / 2;
    this.top = this.add.container(0, 0).setDepth(10);
    this.bottom = this.add.container(0, 0).setDepth(10);
    this.top.add([
      panel(this, cx - 50, 4, 100, 20, 'wood'),
      text(this, cx, 14, 'GALLEY', light()).setOrigin(0.5),
      new Button(this, DISPLAY.width - 30, 14, {
        width: 48, height: 20, label: 'Back', onClick: () => this.close(),
      }),
    ]);
    this.tabButtons = TABS.map(({ key, label }, i) => {
      const b = new Button(this, 8 + GALLEY.tabWidth / 2 + i * (GALLEY.tabWidth + 4), 14, {
        width: GALLEY.tabWidth, height: 20, label, onClick: () => this.select(key),
      });
      this.top.add(b);
      return b;
    });

    // Fishing: the spots along the top, Bait (and Spice) on the right, the
    // message in the sky, CAST at the bottom.
    this.fishingUi = this.add.container(0, 0);
    this.top.add(this.fishingUi);
    const { y, width, height, gap } = GALLEY.spots;
    this.spotButtons = fishingSpots(this.progress).map((spot, i) => {
      const b = new Button(this, 8 + width / 2 + i * (width + gap), y, {
        width, height, label: spot.shortName, font: 'small', onClick: () => this.pickSpot(spot.id),
      });
      b.spot = spot.id;
      this.fishingUi.add(b);
      return b;
    });
    const bx = DISPLAY.width - 106;
    this.baitPanel = panel(this, bx, 28, 100, 32, 'wood');
    this.baitIcon = this.add.image(bx + 11, 38, fishingKey('icons'), iconFrame('bait'));
    this.baitText = text(this, bx + 21, 38, '', light()).setOrigin(0, 0.5);
    this.baitNext = text(this, bx + 6, 52, '', light({ font: 'small' })).setOrigin(0, 0.5);
    this.fishingUi.add([this.baitPanel, this.baitIcon, this.baitText, this.baitNext]);
    this.message = this.add.container(0, 0);
    this.fishingUi.add(this.message);

    this.castButton = new Button(this, cx, 252, {
      width: 96, height: 24, style: 'gold', label: 'CAST', onClick: () => this.cast(),
    });
    this.bottom.add(this.castButton);

    // Cooking: over a dark backdrop, the recipe list and the chosen one.
    this.cookingShade = fillView(this, 0x0d1117, 0.9).setDepth(9);
    this.cookingUi = this.add.container(0, 0);
    this.top.add(this.cookingUi);
    this.recipe ??= FISH_DATA.meals[0]?.id;

    // The reel's timing bar (world pixels, above the water).
    const R = FISHING.reel;
    this.bar = this.add.container(0, 0).setVisible(false).setDepth(5);
    this.barLeft = Math.round(LAYOUT.shipContactX + 150 - R.width / 2);
    this.barTop = R.y - R.height / 2;
    this.zoneRect = this.add.rectangle(0, this.barTop + 1, 10, R.height - 2, R.zone).setOrigin(0);
    this.marker = this.add.image(0, this.barTop - 1, fishingKey('reel_marker')).setOrigin(0.5, 0);
    this.pips = this.add.graphics();
    this.bar.add([nineSlice(this, this.barLeft, this.barTop, R.width, R.height, 'bar_frame'), this.zoneRect, this.marker, this.pips]);

    this.refreshBait();
  }

  layoutUi(view) {
    this.top.setPosition(0, view.top);
    this.bottom.setPosition(0, Math.round(view.bottom - DISPLAY.height));
  }

  select(tab, { quiet = false } = {}) {
    if (!quiet) sfx.click();
    if (tab !== 'fishing' && this.state !== S.IDLE) this.reset();
    this.tab = tab;
    this.tabButtons.forEach((b, i) => b.setStyle(TABS[i].key === tab ? 'gold' : 'wood'));
    const fishing = tab === 'fishing';
    this.fishingUi.setVisible(fishing);
    this.castButton.setVisible(fishing);
    this.cookingShade.setVisible(!fishing);
    this.cookingUi.setVisible(!fishing);
    if (!fishing) this.drawCooking();
    this.refreshSpots();
  }

  // --- Cooking ---

  // The Spice and active meal strip, the twelve recipes down the left (the
  // Pantry's count of each, a green up-arrow on one that can be cooked
  // now), and the chosen recipe on the right.
  drawCooking() {
    const p = this.progress;
    const C = GALLEY.cooking;
    const ui = this.cookingUi;
    ui.removeAll(true);
    const add = (...objs) => ui.add(objs);

    // Spice, and the meal being eaten.
    add(panel(this, 8, C.stripY, 84, 20, 'wood'));
    add(this.add.image(19, C.stripY + 10, fishingKey('items'), itemFrame('spice')));
    add(text(this, 30, C.stripY + 10, `SPICE ${formatNum(p.spice)}`, light()).setOrigin(0, 0.5));
    add(panel(this, 96, C.stripY, 376, 20, 'wood'));
    if (p.meal) {
      const meal = mealOf(p.meal.id);
      const n = p.meal.wavesLeft;
      add(this.add.image(107, C.stripY + 10, fishingKey('meals'), meal.index));
      add(text(this, 118, C.stripY + 10, `EATING: ${meal.name.toUpperCase()}`, light()).setOrigin(0, 0.5));
      add(text(this, 466, C.stripY + 10, `${n} WAVE${n === 1 ? '' : 'S'} LEFT`, light({ font: 'small', color: '#ffd86a' })).setOrigin(1, 0.5));
    } else {
      add(text(this, 104, C.stripY + 10, 'NO MEAL - COOK ONE, THEN EAT IT', light({ font: 'small' })).setOrigin(0, 0.5));
    }

    // The recipes.
    const L = C.list;
    add(panel(this, L.x, L.y, L.width, L.height, 'parchment'));
    FISH_DATA.meals.forEach((meal, i) => {
      const y = L.y + 4 + i * L.rowHeight;
      const cy = y + L.rowHeight / 2;
      const known = p.isRecipeKnown(meal.id);
      if (meal.id === this.recipe) {
        add(this.add.rectangle(L.x + 4, y, L.width - 8, L.rowHeight, hexColor(UI_KIT.dividerColor)).setOrigin(0));
      }
      const img = this.add.image(L.x + 14, cy, fishingKey('meals'), meal.index);
      if (!known) img.setTintFill(hexColor(UI.colors.subText)).setAlpha(0.6);
      const name = text(this, L.x + 26, cy, known ? meal.name : '???', dark()).setOrigin(0, 0.5);
      add(img, name);
      if (p.canCook(meal.id)) add(glyph(this, name.anchorX + name.inkWidth + 5, cy, 'up', UI_KIT.affordColor));
      const n = p.pantryCount(meal.id);
      if (n) add(text(this, L.x + L.width - 8, cy, `X${formatNum(n)}`, subText({ color: UI.colors.textOnParchment })).setOrigin(1, 0.5));
      const hit = this.add.rectangle(L.x + 4, y, L.width - 8, L.rowHeight, 0xffffff, 0).setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (this.recipe === meal.id) return;
        sfx.click();
        this.recipe = meal.id;
        this.drawCooking();
      });
      add(hit);
    });

    this.drawRecipe(mealOf(this.recipe));
  }

  // The chosen recipe: its picture, what it does and for how long, what it
  // needs (have / need, red where short), Cook, the Pantry's count and Eat.
  drawRecipe(meal) {
    const p = this.progress;
    const D = GALLEY.cooking.detail;
    const add = (...objs) => this.cookingUi.add(objs);
    const { x, y } = D;
    const ink = (extra = {}) => subText({ color: UI.colors.textOnParchment, ...extra });
    add(panel(this, x, y, D.width, D.height, 'parchment'));
    const known = p.isRecipeKnown(meal.id);
    const img = this.add.image(x + 24, y + 22, fishingKey('meals'), meal.index).setScale(2);
    if (!known) img.setTintFill(hexColor(UI.colors.subText)).setAlpha(0.6);
    add(img, text(this, x + 46, y + 10, known ? meal.name : '???', dark()));
    if (!known) {
      add(text(this, x + 46, y + 25, 'CATCH EACH OF ITS FISH TO LEARN IT', subText({ wrap: D.width - 56 })));
    } else {
      const caretaker = p.activeHeroes.some(({ id }) => traitOf(id) === MEALS.caretakerTrait);
      const extra = caretaker ? ` (CARETAKER +${MEALS.caretakerWaves})` : '';
      add(text(this, x + 46, y + 25, `LASTS ${p.mealWaves(meal.id)} WAVES${extra}`, subText()));
      const lines = mealEffectLines(meal);
      lines.forEach((line, i) => add(text(this, x + 12, y + 46 + i * 10, line, ink())));
      if (meal.note) add(text(this, x + 12, y + 46 + lines.length * 10, `"${meal.note.toUpperCase()}"`, subText()));
    }

    // What it needs: each fish (a silhouette until caught) and Spice.
    add(text(this, x + 12, y + D.needsY, 'NEEDS', subText()));
    const needs = [...mealFish(meal), ...(meal.needs.spice ? [['spice', meal.needs.spice]] : [])];
    needs.forEach(([id, n], i) => {
      const ry = y + D.needsY + 16 + i * 18;
      const spice = id === 'spice';
      const caught = spice || p.hasCaught(id);
      const have = spice ? p.spice : p.fishCount(id);
      let art;
      if (spice) art = this.add.image(x + 20, ry, fishingKey('items'), itemFrame('spice'));
      else if (caught) art = this.add.image(x + 20, ry, fishingKey('fish'), fishOf(id).index);
      else art = this.add.image(x + 20, ry, fishingKey('items'), itemFrame('unknown_fish'));
      const name = spice ? 'Spice' : caught ? fishOf(id).name : '???';
      add(art, text(this, x + 34, ry, `${n} ${name.toUpperCase()}`, ink()).setOrigin(0, 0.5));
      add(text(this, x + D.width - 12, ry, `${formatNum(have)}/${n}`,
        subText({ color: have >= n ? UI.colors.textOnParchment : UI.colors.warn })).setOrigin(1, 0.5));
    });

    // Cook, the Pantry and Eat.
    const by = y + D.height - 16;
    const cook = new Button(this, x + 44, by, {
      width: 72, height: 20, style: 'gold', label: 'Cook', onClick: () => this.cook(meal.id),
    });
    const eat = new Button(this, x + D.width - 44, by, {
      width: 72, height: 20, label: 'Eat', onClick: () => this.eat(meal.id),
    });
    add(cook.setEnabled(p.canCook(meal.id)), eat.setEnabled(p.pantryCount(meal.id) > 0));
    add(text(this, x + D.width / 2, by, `PANTRY: ${formatNum(p.pantryCount(meal.id))}`, ink()).setOrigin(0.5, 0.5));
  }

  cook(id) {
    if (!this.progress.cook(id)) return;
    sfx.splat();
    saveProgress(this.progress);
    this.drawCooking();
  }

  // Eat a meal from the Pantry; one still going is replaced, after a
  // confirm.
  eat(id) {
    const p = this.progress;
    if (p.pantryCount(id) < 1) return;
    const doEat = () => {
      p.eat(id);
      sfx.loot('gold');
      saveProgress(p);
      this.drawCooking();
    };
    if (!p.meal) {
      doEat();
      return;
    }
    const left = p.meal.wavesLeft;
    new ConfirmDialog(this, {
      title: 'Replace meal?',
      message: `${mealOf(p.meal.id).name} still has ${left} wave${left === 1 ? '' : 's'} left. Eat ${mealOf(id).name} instead?`,
      confirmLabel: 'Eat',
      onConfirm: doEat,
    });
  }

  pickSpot(id) {
    if (this.state !== S.IDLE || id === this.spotId) return;
    sfx.click();
    this.spotId = id;
    this.showSpot();
    this.refreshSpots();
  }

  refreshSpots() {
    for (const b of this.spotButtons) {
      b.setStyle(b.spot === this.spotId ? 'gold' : 'wood');
      b.setEnabled(this.state === S.IDLE);
    }
  }

  // "4/6" and the time to the next one ("+1 IN 12:34", or FULL).
  refreshBait() {
    const p = this.progress;
    const left = p.baitTimeLeft();
    this.baitText.setText(`BAIT ${formatNum(p.bait)}/${p.baitCap}`);
    this.baitNext.setText(left == null ? 'FULL' : `+1 IN ${fmtClock(left)}`);
    this.castButton.setEnabled(this.state === S.IDLE && p.bait > 0);
  }

  // A message in the sky over the sea (lines of [text, colour, font]).
  say(lines) {
    this.message.removeAll(true);
    let y = 74;
    for (const [str, color = UI.colors.text, font = 'main'] of lines) {
      const t = text(this, DISPLAY.width / 2 + 40, y, str, light({ font, color })).setOrigin(0.5, 0);
      this.message.add(t);
      y += t.inkHeight + 5;
    }
  }

  // --- Fishing ---

  later(ms, fn) {
    this.timers.push(this.time.delayedCall(ms, fn));
  }

  clearTimers() {
    for (const t of this.timers) t.remove();
    this.timers = [];
  }

  // Back to standing there: no line, bobber or fish.
  reset() {
    this.clearTimers();
    this.state = S.IDLE;
    this.bobber.setVisible(false);
    this.alert.setVisible(false);
    this.heldFish.setVisible(false);
    this.bar.setVisible(false);
    this.line.clear();
    this.idle();
    this.refreshSpots();
    this.refreshBait();
  }

  // An outcome: its message, then back to idle after FISHING.messageMs.
  finish(lines) {
    this.state = S.DONE;
    this.clearTimers();
    this.say(lines);
    this.later(FISHING.messageMs, () => {
      this.reset();
      this.message.removeAll(true);
    });
  }

  cast() {
    if (this.state !== S.IDLE || this.tab !== 'fishing') return;
    const p = this.progress;
    if (!p.useBait()) {
      sfx.denied();
      return;
    }
    saveProgress(p);
    sfx.flip();
    this.message.removeAll(true);
    this.state = S.CASTING;
    this.refreshSpots();
    this.refreshBait();
    const { cast } = FISHING;
    this.pose('cast_back');
    this.later(cast.castBackMs, () => {
      this.pose('cast_throw');
      const from = this.rodTip;
      const bx = Phaser.Math.Between(cast.bobberX[0], cast.bobberX[1]);
      const to = { x: bx - 4, y: LAYOUT.waterY - this.json.bobber.waterline_y };
      this.bobber.setFrame(0).setVisible(true).setPosition(from.x - 4, from.y);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: cast.flightMs,
        onUpdate: (tw) => {
          const t = tw.getValue();
          this.bobber.setPosition(
            Math.round(from.x - 4 + (to.x - from.x + 4) * t),
            Math.round(from.y + (to.y - from.y) * t - 4 * cast.arcHeight * t * (1 - t)),
          );
        },
        onComplete: () => this.land(),
      });
    });
  }

  // The bobber is in: a splash, then the wait for a bite (maybe a fake
  // nibble first).
  land() {
    if (this.state !== S.CASTING) return;
    this.splash();
    sfx.plop();
    this.bobber.play(`${fishingKey('bobber')}_float`);
    this.pose('wait');
    this.state = S.WAITING;
    const w = FISHING.wait;
    const ms = Phaser.Math.Between(w.min, w.max);
    if (Math.random() < w.nibbleChance) {
      const at = Phaser.Math.Between(400, Math.max(400, ms - w.nibbleMs - 400));
      this.later(at, () => this.dip(w.nibbleMs));
    }
    this.later(ms, () => this.bite());
  }

  splash() {
    const s = this.add.sprite(this.bobber.x + 4, LAYOUT.waterY, fishingKey('splash')).setOrigin(0.5, 1);
    s.play(`${fishingKey('splash')}_pop`).once('animationcomplete', () => s.destroy());
  }

  // A fake nibble: the bobber dips for ms, no "!".
  dip(ms) {
    if (this.state !== S.WAITING) return;
    this.bobber.stop().setFrame(this.json.bobber.anims.dip[0]);
    this.later(ms, () => {
      if (this.state === S.WAITING) this.bobber.play(`${fishingKey('bobber')}_float`);
    });
  }

  // A bite: the rarity and fish are rolled now (unseen); FISHING.bite.ms to
  // tap.
  bite() {
    if (this.state !== S.WAITING) return;
    this.state = S.BITE;
    this.rarity = rollRarity();
    this.fishId = rollFish(this.spotId, this.rarity);
    this.bobber.stop().setFrame(this.json.bobber.anims.dip[0]);
    this.splash();
    this.alert.setVisible(true);
    sfx.bite();
    this.later(FISHING.bite.ms, () => {
      if (this.state === S.BITE) this.finish([['IT GOT AWAY...', UI.colors.warn]]);
    });
  }

  onTap() {
    if (this.tab !== 'fishing') return;
    if (this.state === S.WAITING) {
      // Pulled in too early: the bait is gone.
      sfx.denied();
      this.finish([['TOO EARLY!', UI.colors.warn], ['THE BAIT IS GONE', UI.colors.text, 'small']]);
    } else if (this.state === S.BITE) {
      this.startReel();
    } else if (this.state === S.REELING) {
      this.reelTap();
    }
  }

  // The reel: the timing bar with its catch zone (its width the only hint
  // of the rarity) and the marker sweeping back and forth.
  startReel() {
    this.clearTimers();
    this.state = S.REELING;
    this.alert.setVisible(false);
    this.pose('tug');
    this.bobber.setFrame(this.json.bobber.anims.under[0]);
    const spec = reelSpec(this.rarity);
    this.reel = {
      hits: 0, strikes: 0, need: hitsToLand(this.rarity), pos: 0, dir: 1, sweepMs: spec.sweepMs, zoneW: spec.zone,
    };
    this.moveZone();
    this.bar.setVisible(true);
    this.drawPips();
    sfx.click();
  }

  get barInner() { return FISHING.reel.width - 2; }

  // The catch zone somewhere new along the bar.
  moveZone() {
    const r = this.reel;
    const w = Math.max(4, Math.round(r.zoneW * this.barInner));
    let left;
    do left = Phaser.Math.Between(0, this.barInner - w);
    while (r.zone != null && Math.abs(left - r.zone.left) < w && this.barInner - w > w * 2);
    r.zone = { left, w };
    this.zoneRect.setPosition(this.barLeft + 1 + left, this.barTop + 1).setSize(w, FISHING.reel.height - 2);
  }

  reelTap() {
    const r = this.reel;
    const x = r.pos * this.barInner;
    const R = FISHING.reel;
    if (x >= r.zone.left && x <= r.zone.left + r.zone.w) {
      r.hits++;
      sfx.click();
      if (r.hits >= r.need) {
        this.landFish();
        return;
      }
      r.sweepMs /= 1 + R.speedUp;
      this.moveZone();
    } else {
      r.strikes++;
      sfx.denied();
      this.cameras.main.shake(80, 0.003);
      if (r.strikes >= R.strikes) {
        this.bar.setVisible(false);
        this.finish([['IT GOT AWAY!', UI.colors.warn]]);
        return;
      }
    }
    this.drawPips();
  }

  // Hits so far (green) and strikes (red) under the bar.
  drawPips() {
    const r = this.reel;
    const g = this.pips.clear();
    const y = this.barTop + FISHING.reel.height + 2;
    for (let i = 0; i < r.need; i++) {
      g.fillStyle(hexColor(i < r.hits ? FISHING.reel.hitColor : '#3a2a1a'));
      g.fillRect(this.barLeft + 1 + i * 6, y, 4, 4);
    }
    for (let i = 0; i < FISHING.reel.strikes; i++) {
      g.fillStyle(hexColor(i < r.strikes ? FISHING.reel.missColor : '#3a2a1a'));
      g.fillRect(this.barLeft + FISHING.reel.width - 5 - i * 6, y, 4, 4);
    }
  }

  // Landed: held up, named in its rarity's colour, NEW! the first time
  // (with its Spice).
  landFish() {
    this.bar.setVisible(false);
    this.bobber.setVisible(false);
    this.line.clear();
    const id = this.fishId;
    const fish = fishOf(id);
    const { isNew, spice } = this.progress.catchFish(id);
    saveProgress(this.progress);
    this.pose('hold_up');
    this.heldFish.setFrame(fish.index).setVisible(true);
    this.splash();
    sfx.reveal(this.rarity === 'junk' ? 'common' : this.rarity === 'uncommon' ? 'rare' : this.rarity === 'rare' ? 'epic' : this.rarity, isNew);
    const lines = [[fish.name.toUpperCase(), reelSpec(fish.rarity).color]];
    if (isNew) lines.push([`NEW!${spice ? `  +${spice} SPICE` : ''}`, '#ffd86a', 'small']);
    this.finish(lines);
  }

  update(_time, delta) {
    this.baitClock = (this.baitClock ?? 0) + delta;
    if (this.baitClock >= 250) {
      this.baitClock = 0;
      this.refreshBait();
    }
    if (this.state === S.REELING) {
      const r = this.reel;
      r.pos += r.dir * delta / r.sweepMs;
      if (r.pos >= 1 || r.pos <= 0) {
        r.dir = -r.dir;
        r.pos = Phaser.Math.Clamp(r.pos, 0, 1);
      }
      this.marker.setX(Math.round(this.barLeft + 1 + r.pos * this.barInner));
    }
    this.drawLine();
  }

  // The fishing line, 1px, from the rod tip to the bobber's top: a little
  // sag while it waits, taut while reeling.
  drawLine() {
    const g = this.line.clear();
    const tip = this.rodTip;
    if (!this.bobber.visible || !tip) return;
    const to = { x: this.bobber.x + 4, y: this.bobber.y + 1 };
    const sag = this.state === S.WAITING || this.state === S.BITE ? FISHING.cast.sag : 0;
    const steps = Math.max(Math.abs(to.x - tip.x), Math.abs(to.y - tip.y), 1);
    g.fillStyle(FISHING.cast.lineColor);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      g.fillRect(Math.round(tip.x + (to.x - tip.x) * t), Math.round(tip.y + (to.y - tip.y) * t + sag * 4 * t * (1 - t)), 1, 1);
    }
  }

  close() {
    sfx.click();
    this.clearTimers();
    saveProgress(this.progress);
    this.scene.stop();
    this.onClose?.();
  }
}
