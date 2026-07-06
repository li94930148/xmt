const ROLE_LABELS: Record<string, string> = {
  admin: '\u7ba1\u7406\u5458',
  director: '\u7ba1\u7406\u5c42',
  editor: '\u901a\u7528\u7f16\u8f91',
  copywriter: '\u6587\u6848',
  post_production: '\u540e\u671f',
  camera: '\u6444\u50cf',
  member: '\u666e\u901a\u4eba\u5458',
};

export function getRoleDisplayName(roleCode?: string | null) {
  if (!roleCode) {
    return '\u672a\u5206\u914d\u89d2\u8272';
  }

  return ROLE_LABELS[roleCode] || roleCode;
}
