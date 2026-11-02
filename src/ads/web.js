// The website's ad provider: there are no ads on the web, so a reward is
// granted at once (testers aren't held up by a button they can't use).
export function webProvider() {
  return {
    name: 'web',
    free: true,
    show: async () => 'rewarded',
  };
}
