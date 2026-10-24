import { pageRect } from '../display.js';

// A one-line text field: a real HTML <input> (class game-field, styled in
// index.html) kept over a box of the scene, so phones get their keyboard,
// paste and selection. box() returns { x, y, w, h } in the scene's layout
// pixels (it's asked again whenever the view or window resizes: call
// place() after moving what it sits on). The text scales with the box.
// Enter calls onEnter. Gone with destroy() (or the scene's shutdown).
export class HtmlField {
  constructor(scene, {
    box, placeholder = '', maxLength = 64, value = '', upper = false, onEnter = null,
  }) {
    this.scene = scene;
    this.box = box;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'game-field';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', upper ? 'characters' : 'words');
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.value = value;
    if (upper) input.style.textTransform = 'uppercase';
    input.addEventListener('keydown', (event) => {
      // Keys typed here are the field's, not the game's (keys 1-6 use abilities).
      event.stopPropagation();
      if (event.key === 'Enter') onEnter?.();
    });
    document.body.appendChild(input);
    this.input = input;

    this.place = this.place.bind(this);
    scene.events.on('view-resize', this.place);
    window.addEventListener('resize', this.place);
    this.onShutdown = () => this.destroy();
    scene.events.once('shutdown', this.onShutdown);
    this.place();
  }

  place() {
    if (!this.input) return;
    const { x, y, w, h } = this.box();
    const r = pageRect(this.scene, x, y, w, h);
    Object.assign(this.input.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      fontSize: `${Math.max(10, Math.round(r.height * 0.5))}px`,
    });
  }

  get value() { return this.input?.value ?? ''; }

  setValue(v) {
    if (this.input) this.input.value = v;
    return this;
  }

  setVisible(on) {
    if (this.input) this.input.style.visibility = on ? '' : 'hidden';
    return this;
  }

  focus() {
    this.input?.focus();
    return this;
  }

  destroy() {
    if (!this.input) return;
    this.input.remove();
    this.input = null;
    this.scene.events.off('view-resize', this.place);
    this.scene.events.off('shutdown', this.onShutdown);
    window.removeEventListener('resize', this.place);
  }
}
