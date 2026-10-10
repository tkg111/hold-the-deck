// Whether the dev tools (src/dev/) are on: always in development builds, and
// on the live site only with ?dev in the URL, so players don't see them.
export const DEV_TOOLS = import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev');
