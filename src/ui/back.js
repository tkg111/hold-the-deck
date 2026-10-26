// Android's back button (src/native.js): it closes whatever is on top, the
// way its own close button would, and on the bare battle screen asks before
// leaving the game.
//   1. the newest open dialog (Settings, a confirmation, a save code, the
//      captain name), which registers itself here with onBack();
//   2. else the topmost scene over the battle (its back(), or close());
//   3. else the battle's hero picker;
//   4. else, on the battle, "Leave port?" (GameScene.confirmLeave).
// Nothing happens while the Captain is mid-lesson (his blocker is up) or
// before the battle exists (the title screen leaves at once).

const stack = [];   // open dialogs' close functions, newest last

// Register what back does while a dialog is open; returns the unregister.
export function onBack(close) {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

// The scenes that aren't panels over the battle.
const BASE = new Set(['TitleScene', 'GameScene', 'TutorialScene']);

// Handle one press. Returns false when there's no game to go back in (the
// title screen): the app then leaves.
export function handleBack(game, tutorial) {
  const battle = game.scene.getScene('GameScene');
  if (!battle?.progress) return false;
  if (tutorial?.active) return true;
  if (stack.length) {
    stack[stack.length - 1]();
    return true;
  }
  const overlays = game.scene.getScenes(true).filter((s) => !BASE.has(s.sys.settings.key));
  const top = overlays[overlays.length - 1];
  if (top) {
    if (typeof top.back === 'function') top.back();
    else top.close?.();
    return true;
  }
  if (battle.heroPicker?.visible) {
    battle.heroPicker.close();
    return true;
  }
  battle.confirmLeave();
  return true;
}
