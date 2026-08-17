export const ANDROID_PRODUCTION_API_BASE_URL = 'https://lanyaomedia.com/api';
export const ANDROID_PRODUCTION_SOCKET_BASE_URL = 'https://lanyaomedia.com';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export function getNativeEndpointConfigurationErrorFor({
  native,
  development,
  apiBaseUrl,
  socketBaseUrl,
  allowCleartext,
}: {
  native: boolean;
  development: boolean;
  apiBaseUrl?: string;
  socketBaseUrl?: string;
  allowCleartext?: boolean;
}) {
  if (!native || development) return null;
  const api = trimTrailingSlash(apiBaseUrl?.trim() || '');
  const socket = trimTrailingSlash(socketBaseUrl?.trim() || '');
  if (api === ANDROID_PRODUCTION_API_BASE_URL && socket === ANDROID_PRODUCTION_SOCKET_BASE_URL && !allowCleartext) return null;
  return '移动端构建配置无效，请安装正确版本。';
}
