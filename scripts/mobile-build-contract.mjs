export const ANDROID_PRODUCTION_ENDPOINTS = Object.freeze({
  platform: 'android',
  target: 'production',
  apiBaseUrl: 'https://lanyaomedia.com/api',
  socketBaseUrl: 'https://lanyaomedia.com',
  allowCleartext: false,
});

const forbiddenProductionEndpoint = /^(?:\/|https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)|https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.))/i;

export function validateAndroidProductionEndpoints({ apiBaseUrl, socketBaseUrl }) {
  const api = String(apiBaseUrl || '').trim().replace(/\/+$/, '');
  const socket = String(socketBaseUrl || '').trim().replace(/\/+$/, '');
  if (!api || !socket) return 'ANDROID_PRODUCTION_ENDPOINT_MISSING';
  if (forbiddenProductionEndpoint.test(api) || forbiddenProductionEndpoint.test(socket)) return 'ANDROID_PRODUCTION_ENDPOINT_FORBIDDEN';
  if (!/^https:\/\/lanyaomedia\.com\/api$/i.test(api)) return 'ANDROID_PRODUCTION_API_ENDPOINT_INVALID';
  if (!/^https:\/\/lanyaomedia\.com$/i.test(socket)) return 'ANDROID_PRODUCTION_SOCKET_ENDPOINT_INVALID';
  return null;
}

export function resolveAndroidBuildProfile(target, environment = process.env) {
  if (target === 'production') {
    return { ...ANDROID_PRODUCTION_ENDPOINTS };
  }

  if (target === 'development') {
    const apiBaseUrl = String(environment.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
    const socketBaseUrl = String(environment.VITE_SOCKET_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!apiBaseUrl || !socketBaseUrl) throw new Error('ANDROID_DEVELOPMENT_ENDPOINT_MISSING');
    return {
      platform: 'android',
      target: 'development',
      apiBaseUrl,
      socketBaseUrl,
      allowCleartext: environment.VITE_ANDROID_ALLOW_CLEARTEXT === 'true',
    };
  }

  throw new Error(`Unknown Android build target: ${target}`);
}

export function buildEnvironmentForProfile(profile, environment = process.env) {
  return {
    ...environment,
    VITE_APP_PLATFORM: 'android',
    VITE_API_BASE_URL: profile.apiBaseUrl,
    VITE_SOCKET_BASE_URL: profile.socketBaseUrl,
    VITE_ANDROID_ALLOW_CLEARTEXT: String(profile.allowCleartext),
  };
}

export function createAndroidBuildManifest({ version, versionCode, profile }) {
  return {
    version,
    versionCode,
    platform: profile.platform,
    target: profile.target,
    apiBaseUrl: profile.apiBaseUrl,
    socketBaseUrl: profile.socketBaseUrl,
  };
}
