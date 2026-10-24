// A new version of the game is waiting (the service worker has it): when the
// player taps the Captain's banner, save and reload, but never during a
// wave. A tap while a wave runs waits for it to end. Knows nothing of the
// page: the host gives it isBusy() (a wave is running), save() and reload()
// (the headless tests pass fakes).
export class UpdateGate {
  constructor({ isBusy, save, reload }) {
    this.isBusy = isBusy;
    this.save = save;
    this.reload = reload;
    this.available = false;  // a new version is waiting
    this.wanted = false;     // the player asked for it
    this.done = false;       // reloading
  }

  // The service worker has a new version ready.
  offer() {
    this.available = true;
  }

  // The player tapped the banner: update now, or once the wave is over.
  request() {
    if (!this.available) return;
    this.wanted = true;
    this.settle();
  }

  // Something changed (a wave ended): update if it's wanted and safe.
  settle() {
    if (!this.wanted || this.done || this.isBusy()) return false;
    this.done = true;
    this.save();
    this.reload();
    return true;
  }
}
