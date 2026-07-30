import bcrypt from 'bcrypt';

export interface PasswordService {
  verify(password: unknown, passwordHash: string): Promise<boolean>;
  hash(password: unknown): Promise<string>;
}

export class BcryptPasswordService implements PasswordService {
  verify(password: unknown, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password as string, passwordHash);
  }

  hash(password: unknown): Promise<string> {
    return bcrypt.hash(password as string, 10);
  }
}
