import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_ALLOWED_ORIGINS } from '../../api/security/origin-policy.js';
import { resolveAppRuntimeConfig } from '../../api/config/app-runtime.js';
import { appVersion, readAppVersion } from '../../api/config/index.js';

describe('app runtime configuration contracts', () => {
  it('uses safe defaults for proxy, origins, feature switches, auth, and health environment', () => {
    const config = resolveAppRuntimeConfig({});

    expect(config.trustProxyHops).toBe(1);
    expect(config.allowedOrigins).toEqual(new Set(DEFAULT_ALLOWED_ORIGINS));
    expect(config.topicsV1Enabled).toBe(false);
    expect(config.authV1Enabled).toBe(false);
    expect(config.authV1LoginEnabled).toBe(false);
    expect(config.authRefreshPepper).toBe('');
    expect(config.environment).toBe('development');
  });

  it('keeps the ALLOWED_ORIGINS priority and CORS_ORIGINS compatibility fallback', () => {
    const preferred = resolveAppRuntimeConfig({
      ALLOWED_ORIGINS: 'https://allowed.example',
      CORS_ORIGINS: 'https://legacy.example',
    });
    expect(preferred.allowedOrigins).toEqual(new Set(['https://allowed.example']));

    const compatibility = resolveAppRuntimeConfig({
      ALLOWED_ORIGINS: '',
      CORS_ORIGINS: 'https://legacy.example',
    });
    expect(compatibility.allowedOrigins).toEqual(new Set(['https://legacy.example']));

    const failClosedWhitespace = resolveAppRuntimeConfig({
      ALLOWED_ORIGINS: ' ',
      CORS_ORIGINS: 'https://legacy.example',
    });
    expect(failClosedWhitespace.allowedOrigins).toEqual(new Set());
  });

  it('uses safe proxy and feature-switch parsing and trims the refresh pepper', () => {
    const config = resolveAppRuntimeConfig({
      TRUST_PROXY: '2',
      XMT_TOPICS_V1_ENABLED: 'true',
      XMT_AUTH_V1_ENABLED: 'true',
      XMT_AUTH_REFRESH_PEPPER: '  test-pepper  ',
      NODE_ENV: 'test',
    });

    expect(config.trustProxyHops).toBe(2);
    expect(resolveAppRuntimeConfig({ TRUST_PROXY: 'true' }).trustProxyHops).toBe(1);
    expect(config.topicsV1Enabled).toBe(true);
    expect(config.authV1Enabled).toBe(true);
    expect(config.authV1LoginEnabled).toBe(true);
    expect(config.authRefreshPepper).toBe('test-pepper');
    expect(config.environment).toBe('test');
  });

  it('fails closed for production Auth v1 without the reviewed allowlist approval tuple', () => {
    const unapproved = resolveAppRuntimeConfig({
      NODE_ENV: 'production',
      XMT_AUTH_V1_ENABLED: 'true',
      XMT_AUTH_WEB_ENABLED: 'true',
      XMT_AUTH_REFRESH_PEPPER: 'pepper',
    });
    expect(unapproved.authV1Enabled).toBe(false);
    expect(unapproved.authV1LoginEnabled).toBe(false);

    const approvedAllowlist = resolveAppRuntimeConfig({
      NODE_ENV: 'production',
      XMT_AUTH_V1_ENABLED: 'true',
      XMT_AUTH_WEB_ENABLED: 'true',
      XMT_AUTH_ROLLOUT_MODE: 'allowlist',
      XMT_AUTH_ROLLOUT_APPROVED: 'true',
      XMT_AUTH_REFRESH_PEPPER: 'pepper',
    });
    expect(approvedAllowlist.authV1Enabled).toBe(true);
    expect(approvedAllowlist.authV1LoginEnabled).toBe(true);
  });

  it('keeps the legacy login adapter disabled when the refresh pepper is missing', () => {
    const config = resolveAppRuntimeConfig({ XMT_AUTH_V1_ENABLED: 'true' });

    expect(config.authV1Enabled).toBe(true);
    expect(config.authRefreshPepper).toBe('');
    expect(config.authV1LoginEnabled).toBe(false);
  });

  it('resolves the application version from the repository package independent of the working directory', () => {
    const expectedVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('application version lookup must not use process.cwd');
    });
    try {
      expect(appVersion).toBe(expectedVersion);
      expect(readAppVersion()).toBe(expectedVersion);
    } finally {
      cwd.mockRestore();
    }
  });
});
