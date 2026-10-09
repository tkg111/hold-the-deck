// Just enough of Phaser for the game logic to run headless: the maths
// helpers it calls, and base classes the UI modules extend when imported.

class GameObject {
  setPosition() { return this; }
  setOrigin() { return this; }
  setDepth() { return this; }
  setVisible() { return this; }
  setAlpha() { return this; }
  destroy() {}
}

class BitmapText extends GameObject {
  constructor() {
    super();
    this.fontData = { chars: {}, lineHeight: 8 };
    this.lineSpacing = 0;
  }

  getTextBounds() { return { local: { x: 0, width: 0 }, lines: { lengths: [1] } }; }
  setText() { return this; }
  setTint() { return this; }
  clearTint() { return this; }
  setLineSpacing() { return this; }
  setMaxWidth() { return this; }
}

class Container extends GameObject {
  add() { return this; }
}

const Phaser = {
  Math: {
    Clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    Linear: (a, b, t) => a + (b - a) * t,
    Between: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  },
  Utils: {
    Array: {
      Shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
      },
    },
  },
  Display: { Color: { HexStringToColor: (css) => ({ color: parseInt(css.slice(1), 16) }) } },
  GameObjects: { BitmapText, Container },
  Scene: class {},
};

export default Phaser;
