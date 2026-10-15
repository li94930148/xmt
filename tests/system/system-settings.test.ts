import assert from 'node:assert/strict';
import {
  defaultSystemSettings,
  normalizeSystemSettings,
  resolveInitialTheme,
} from '../../src/lib/systemSettings.js';

const legacySettings = normalizeSystemSettings({
  system: { name: '旧配置' },
});
assert.equal(legacySettings.system.defaultTheme, 'dark', 'legacy settings retain the existing dark fallback');

const lightDefault = normalizeSystemSettings({
  system: { defaultTheme: 'light' },
});
assert.equal(lightDefault.system.defaultTheme, 'light');
assert.equal(lightDefault.branding.brandName, defaultSystemSettings.branding.brandName);
assert.equal(
  normalizeSystemSettings({ system: { defaultTheme: 'sepia' } }).system.defaultTheme,
  'dark',
  'invalid stored theme values fail closed to the default',
);

assert.equal(resolveInitialTheme(null, 'light'), 'light', 'system default applies when no local choice exists');
assert.equal(resolveInitialTheme('dark', 'light'), 'dark', 'an explicit local preference takes precedence');
assert.equal(resolveInitialTheme('invalid', 'light'), 'light', 'invalid local values do not override the system default');

console.log('System settings defaults and theme precedence tests passed');
