/**
 * Feature Flags — Foundation #4
 * Simple file-based flags. Swap for LaunchDarkly/Unleash later.
 */
const path = require('path');
let flags = {};
try { flags = require(path.resolve(process.cwd(), 'flags.json')); } catch { /* no flags file */ }

function isEnabled(flag) {
  const envOverride = process.env[`FLAG_${flag.toUpperCase()}`];
  if (envOverride !== undefined) return envOverride === 'true' || envOverride === '1';
  return flags[flag] === true;
}

module.exports = { isEnabled, flags };
