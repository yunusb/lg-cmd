const { withAndroidManifest } = require('expo/config-plugins');

// Older webOS TVs use cleartext local WebSockets ws://TV:3000.
module.exports = function withCleartextForLocalWebOS(config) {
  return withAndroidManifest(config, mod => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
