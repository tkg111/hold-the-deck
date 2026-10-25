// Whether the dev tools (src/dev/) are on: in development builds (unless
// the URL has ?nodev, for screenshots of what players see), and on the live
// site only with ?dev in the URL, so players don't see them.
const params = new URLSearchParams(window.location.search);
export const DEV_TOOLS = (import.meta.env.DEV && !params.has('nodev')) || params.has('dev');
