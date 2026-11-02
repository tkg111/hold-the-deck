import { ADS } from '../config.js';

// The dev builds' stand-in ad, to test the flow: a full-screen "AD" overlay
// (plain page elements, over the game) counting down ADS.mock.ms, then a
// Close button; closing after the countdown is watching it to the end. With
// fail (?adfail in the URL) no ad loads, as when AdMob has none to give.
export function mockProvider({ fail = false } = {}) {
  return {
    name: 'mock',
    free: false,
    show(placement) {
      if (fail) return Promise.resolve('unavailable');
      return new Promise((resolve) => {
        const box = document.createElement('div');
        box.setAttribute('role', 'dialog');
        box.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#101018;color:#f4e8c8;'
          + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;'
          + 'font:bold 20px monospace;text-align:center;touch-action:none;user-select:none;';
        const title = document.createElement('div');
        title.textContent = 'AD';
        title.style.cssText = 'font-size:64px;letter-spacing:8px;border:4px solid #f4e8c8;padding:8px 24px;';
        const note = document.createElement('div');
        note.textContent = `Mock rewarded ad (${placement})`;
        const count = document.createElement('div');
        const close = document.createElement('button');
        close.textContent = 'Close';
        close.style.cssText = 'font:bold 20px monospace;padding:8px 28px;background:#f2c14e;color:#2a1e14;border:3px solid #2a1e14;visibility:hidden;';
        box.append(title, note, count, close);
        document.body.append(box);
        const end = Date.now() + ADS.mock.ms;
        const tick = () => {
          const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
          count.textContent = left ? `Reward in ${left}...` : 'Reward earned!';
          if (!left) {
            close.style.visibility = 'visible';
            clearInterval(timer);
          }
        };
        const timer = setInterval(tick, 200);
        tick();
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          clearInterval(timer);
          box.remove();
          resolve(Date.now() >= end ? 'rewarded' : 'closed');
        });
        // Taps on the overlay never reach the game.
        for (const type of ['pointerdown', 'pointerup', 'touchstart', 'mousedown']) {
          box.addEventListener(type, (event) => event.stopPropagation());
        }
      });
    },
  };
}
