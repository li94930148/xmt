import bcrypt from 'bcrypt';

export interface PasswordService {
  verify(password: unknown, passwordHash: string): Promise<boolean>;
}

export class BcryptPasswordService implements PasswordService {
  verify(password: unknown, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password as string, passwordHash);
  }
}
