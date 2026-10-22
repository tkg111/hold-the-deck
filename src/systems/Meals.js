import { MEALS } from '../config.js';

// The active meal in battle: a heal meal (Moonfish Pie) mends its share of
// max hull every MEALS.healEveryMs of a wave. Everything else a meal does
// works through the crew's stats, the hull, gold and the hazards
// (Progress.mealMods). Runs on the battle's dt; with no meal it does nothing.
export class MealEffects {
  constructor(scene) {
    this.scene = scene;
    this.heal = 0;
    this.timer = 0;
  }

  // A wave starts with the meal active now.
  start(progress) {
    this.heal = progress.mealMods.heal;
    this.timer = MEALS.healEveryMs;
  }

  update(dt) {
    if (!this.heal) return;
    this.timer -= dt;
    while (this.timer <= 0) {
      this.timer += MEALS.healEveryMs;
      const { ship } = this.scene;
      ship.heal(ship.maxHp * this.heal);
    }
  }

  stop() {
    this.heal = 0;
  }
}
