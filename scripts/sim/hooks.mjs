// Module resolve hook (see register.mjs): 'phaser' -> the shim.
const SHIM = new URL('./phaser-shim.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'phaser') return { url: SHIM, shortCircuit: true };
  return next(specifier, context);
}
