export interface RoleOption {
  id: number;
  code: string;
  name: string;
}

export interface UserFormData {
  username: string;
  password: string;
  email: string;
  role: string;
  name: string;
  enabled: boolean;
}

export const USER_PAGE_SIZE = 50;

export function buildDefaultForm(roleCode = 'member'): UserFormData {
  return {
    username: '',
    password: '',
    email: '',
    role: roleCode,
    name: '',
    enabled: true,
  };
}
