import Phaser from 'phaser';
import {
  AUDIO, DISPLAY, SCENERY, SPRITES, TITLE, WIDE,
} from '../config.js';
import { audio } from '../audio/Audio.js';
import { initAudio, preloadAudio } from '../audio/load.js';
import { music } from '../audio/Music.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { hideSplash } from '../native.js';
import { preloadSprites, shipFrontKey, shipStageKey } from '../sprites.js';
import { loadAudioSettings } from '../systems/Save.js';
import { light, text } from '../ui/kit.js';
import { APP_VERSION } from '../version.js';

const titleKey = (name) => `title_${name}`;
const TITLE_JSON_KEY = titleKey('layout');
const SHIP_DECKS = 3;   // the title's ship: ship_stage3
// The sheets' frames (title.json says the same; checked once it's loaded).
const GULL_FRAME = [11, 7];
const SEA_FRAME = [480, 40];
const WIDE_SEA_FRAME = [DISPLAY.width + 2 * WIDE.side, 40];

// The title screen, shown on every load: the ship at sunset with gulls and
// waves, the logo dropping in, and TAP TO START. It loads everything the
// game needs (the battle then starts at once). Any tap or key unlocks sound
// (Audio.js), clicks and starts the title music, fades the logo and text
// out, and goes to the battle (where a new save's onboarding then starts).
//
// Positions come from title/title.json, in title_bg.png's 480x430 space:
// the battle's tall layout, whose rows SCENERY.originY.. are the 480x270
// safe view, so the view's extra height is more sky and sea as in battle.
// In a view wider than 480 the background and sea are the wide ones
// (title_bg_wide.png, 640x430, and its sea: the 480 picture at x =
// WIDE.side, drawn at x = -WIDE.side), so every title.json position stays
// as it is and the logo, TAP TO START and the ship stay centred on the
// screen. With prefers-reduced-motion the logo doesn't drop or float and
// TAP TO START blinks slower.
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  preload() {
    preloadSprites(this);
    preloadAudio(this);
    const { load } = this;
    const { path } = load;
    load.setPath(`${import.meta.env.BASE_URL}${SPRITES.path}${TITLE.path}`);
    load.json(TITLE_JSON_KEY, 'title.json');
    load.image(titleKey('bg'), 'title_bg.png');
    load.image(titleKey('logo'), 'logo.png');
    load.spritesheet(titleKey('gull'), 'gull_sheet.png', { frameWidth: GULL_FRAME[0], frameHeight: GULL_FRAME[1] });
    load.spritesheet(titleKey('sea'), 'title_sea_sheet.png', { frameWidth: SEA_FRAME[0], frameHeight: SEA_FRAME[1] });
    load.setPath(`${import.meta.env.BASE_URL}${SPRITES.path}${WIDE.path}`);
    load.image(titleKey('bg_wide'), 'title_bg_wide.png');
    load.spritesheet(titleKey('sea_wide'), 'title_sea_wide_sheet.png', { frameWidth: WIDE_SEA_FRAME[0], frameHeight: WIDE_SEA_FRAME[1] });
    load.setPath(path);
  }

  create() {
    applyRenderScale(this, { y: SCENERY.skyShare });
    initAudio(this);
    audio.setSettings(loadAudioSettings());
    const L = this.cache.json.get(TITLE_JSON_KEY);
    // title.json's 430-tall space to the battlefield's.
    const y = (ty) => ty - SCENERY.originY;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (String(L.gulls.frame) !== String(GULL_FRAME) || String(L.title_sea.frame) !== String(SEA_FRAME)) {
      console.warn('[title] title.json frame sizes differ from GULL_FRAME / SEA_FRAME');
    }

    const bg = this.add.image(0, y(0), titleKey('bg')).setOrigin(0);

    // Gulls drifting across the band, flapping.
    if (!this.anims.exists(titleKey('gull'))) {
      this.anims.create({
        key: titleKey('gull'), frames: this.anims.generateFrameNumbers(titleKey('gull'), { start: 0, end: L.gulls.frames - 1 }),
        frameRate: TITLE.gullFps, repeat: -1,
      });
      for (const sheet of [titleKey('sea'), titleKey('sea_wide')]) {
        this.anims.create({
          key: sheet, frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: L.title_sea.frames - 1 }),
          frameRate: L.title_sea.fps, repeat: -1,
        });
      }
    }
    const [bandTop, bandBottom] = L.gulls.band_y;
    this.gulls = Array.from({ length: L.gulls.count }, (_, i) => {
      const sprite = this.add.sprite(0, 0, titleKey('gull')).setOrigin(0);
      sprite.play({ key: titleKey('gull'), startFrame: i % L.gulls.frames });
      return {
        sprite,
        x: Phaser.Math.Between(Math.round(this.view.left), Math.round(this.view.right)),
        y: y(Phaser.Math.Between(bandTop, bandBottom - GULL_FRAME[1])),
        speed: Phaser.Math.FloatBetween(...TITLE.gullSpeed),
      };
    });

    // The ship, bobbing, under the waves.
    const [sx, sy] = L.ship.pos;
    const ship = this.add.container(sx, y(sy), [
      this.add.image(0, 0, shipStageKey(SHIP_DECKS)).setOrigin(0),
      this.add.image(0, 0, shipFrontKey(SHIP_DECKS)).setOrigin(0),
    ]);
    this.tweens.add({
      targets: ship, y: y(sy) + L.ship.bob_px, duration: L.ship.bob_period_s * 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    const [seaX, seaY] = L.title_sea.pos;
    const sea = this.add.sprite(seaX, y(seaY), titleKey('sea')).setOrigin(0).play(titleKey('sea'));

    // The logo: dropping in from above the view, then floating.
    const [lx, ly] = L.logo.centre;
    const logo = this.add.image(lx, y(ly), titleKey('logo'));
    const float = () => this.tweens.add({
      targets: logo, y: y(ly) + TITLE.logoFloat.px, duration: TITLE.logoFloat.ms / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    if (!reduced) {
      logo.setY(this.view.top - logo.height / 2);
      this.tweens.add({
        targets: logo, y: y(ly), duration: TITLE.logoDropMs, ease: 'Back.easeOut', onComplete: float,
      });
    }

    // TAP TO START, with a dark 1px shadow, blinking.
    const [tx, ty] = L.tap_to_start.centre;
    const shadow = text(this, tx + 1, y(ty) + 1, 'TAP TO START', light({ color: TITLE.shadow })).setOrigin(0.5);
    const tap = text(this, tx, y(ty), 'TAP TO START', light()).setOrigin(0.5);
    const prompt = this.add.container(0, 0, [shadow, tap]);
    const { onMs, offMs, reducedMs } = TITLE.blink;
    const blink = (on) => {
      prompt.setVisible(on);
      this.time.delayedCall(reduced ? reducedMs : on ? onMs : offMs, () => blink(!on));
    };
    blink(true);

    const version = text(this, 0, 0, `v${APP_VERSION}`, light({ font: 'small' })).setOrigin(0, 1);

    // Wide or tall art for the view, the version in its bottom-left corner.
    const layout = (view) => {
      const wide = view.width > DISPLAY.width;
      bg.setTexture(titleKey(wide ? 'bg_wide' : 'bg')).setX(wide ? -WIDE.side : 0);
      const seaKey = titleKey(wide ? 'sea_wide' : 'sea');
      if (sea.anims.currentAnim?.key !== seaKey) sea.setTexture(seaKey).play(seaKey);
      sea.setX(seaX - (wide ? WIDE.side : 0));
      version.setPosition(Math.round(view.safe.left + TITLE.version.x), Math.round(Math.min(DISPLAY.height, view.safe.bottom) - TITLE.version.y));
    };
    layout(this.view);
    this.events.on('view-resize', layout);

    // The first tap or key.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      audio.unlock();
      sfx.play('ui_click');
      music.play(AUDIO.music.title);
      this.time.removeAllEvents();
      prompt.setVisible(true);
      this.tweens.add({
        targets: [logo, prompt, version], alpha: 0, duration: TITLE.fadeMs, onComplete: () => this.scene.start('GameScene'),
      });
    };
    this.input.once('pointerdown', start);
    hideSplash();
    this.input.keyboard?.once('keydown', start);
  }

  update(_time, delta) {
    for (const g of this.gulls) {
      g.x += g.speed * Math.min(delta, 100) / 1000;
      if (g.x > this.view.right) g.x = this.view.left - g.sprite.width;
      g.sprite.setPosition(Math.round(g.x), g.y);
    }
  }
}
