import assert from 'node:assert/strict';
import {
  defaultSystemSettings,
  normalizeSystemSettings,
  resolveInitialTheme,
} from '../../src/lib/systemSettings.js';
import { getUserFacingErrorMessage } from '../../src/lib/userFacingError';

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

assert.equal(
  getUserFacingErrorMessage({ message: 'Internal Server Error' }, '系统设置保存失败，请重试'),
  '系统设置保存失败，请重试',
  'technical server messages use an actionable UI fallback',
);
assert.equal(
  getUserFacingErrorMessage({ message: 'HTTP 503 Service Unavailable' }, '系统设置暂时无法加载，请重试'),
  '系统设置暂时无法加载，请重试',
  'raw HTTP status is not exposed in the UI',
);
assert.equal(
  getUserFacingErrorMessage({ message: '当前设置不符合要求' }, '系统设置保存失败，请重试'),
  '当前设置不符合要求',
  'actionable Chinese validation feedback remains intact',
);

console.log('System settings defaults and theme precedence tests passed');
