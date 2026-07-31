import type { AuthV1User } from '../../../shared/schema/auth.schema';
import type { AuthMode } from './auth-mode';

export type AuthRuntimeStatus =
  | 'anonymous'
  | 'bootstrapping'
  | 'authenticated'
  | 'refreshing'
  | 'expired';

export type AuthRuntimeState = {
  mode: AuthMode;
  status: AuthRuntimeStatus;
  user: AuthV1User | null;
};

export const initialAuthRuntimeState: AuthRuntimeState = {
  mode: 'legacy',
  status: 'anonymous',
  user: null,
};
