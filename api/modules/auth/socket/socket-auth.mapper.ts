import { socketAuthContextSchema } from './socket-auth.schema.js';
import type { SocketAuthContext, SocketAuthenticatedUser } from './socket-auth.types.js';

export function mapSocketAuthContext(input: SocketAuthContext): SocketAuthContext {
  return socketAuthContextSchema.parse(input);
}
export function mapSocketUser(user: SocketAuthenticatedUser): SocketAuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  };
}
