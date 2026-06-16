const ROLE_LABELS: Record<string, string> = {
  admin: '\u7ba1\u7406\u5458',
  director: '\u7f16\u5bfc',
  editor: '\u7f16\u8f91',
  member: '\u6210\u5458',
};

export function getRoleDisplayName(roleCode?: string | null) {
  if (!roleCode) {
    return '\u672a\u5206\u914d\u89d2\u8272';
  }

  return ROLE_LABELS[roleCode] || roleCode;
}
