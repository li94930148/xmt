import type { AuthV1User } from '../../../shared/schema/auth.schema';
import type { AuthMode } from './auth-mode';

export type AuthRuntimeStatus =
  | 'anonymous'
  | 'authenticating'
  | 'bootstrapping'
  | 'authenticated'
  | 'redirecting'
  | 'refreshing'
  | 'expired';

export type AuthRuntimeState = {
  mode: AuthMode;
  status: AuthRuntimeStatus;
  user: AuthV1User | null;
  loginCompleted: boolean;
};

export const initialAuthRuntimeState: AuthRuntimeState = {
  mode: 'legacy',
  status: 'anonymous',
  user: null,
  loginCompleted: false,
};
