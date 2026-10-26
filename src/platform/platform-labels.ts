import { PLATFORMS } from '../constants/index';

const platformLabelsByValue = new Map<string, string>(
  PLATFORMS.map(({ value, label }) => [value.trim().toLowerCase(), label] as const),
);

for (const [alias, label] of Object.entries({
  wechat: '微信视频号',
  wechat_channels: '微信视频号',
  rednote: '小红书',
})) {
  platformLabelsByValue.set(alias, label);
}

export function getPlatformLabel(platform?: string | null): string {
  const normalized = platform?.trim();
  if (!normalized) return '';
  return platformLabelsByValue.get(normalized.toLowerCase()) ?? normalized;
}
