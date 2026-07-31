import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

type CsrfServiceOptions = {
  secret: string;
  version?: number;
};

export class CsrfService {
  private readonly version: number;

  constructor(private readonly options: CsrfServiceOptions) {
    if (!options.secret) throw new Error('CSRF signing secret is required');
    this.version = options.version ?? 1;
  }

  generateToken(sessionId: string): string {
    const nonce = randomBytes(32).toString('base64url');
    const payload = `${this.version}.${nonce}`;
    return `${payload}.${this.sign(sessionId, payload)}`;
  }

  verifyToken(sessionId: string, token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [version, nonce, suppliedSignature] = parts;
    if (version !== String(this.version) || !nonce || !suppliedSignature) return false;
    const expectedSignature = this.sign(sessionId, `${version}.${nonce}`);
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    const expected = Buffer.from(expectedSignature, 'base64url');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  verifyDoubleSubmit(sessionId: string, cookieToken?: string, headerToken?: string): boolean {
    if (!cookieToken || !headerToken) return false;
    const cookie = Buffer.from(cookieToken);
    const header = Buffer.from(headerToken);
    if (cookie.length !== header.length || !timingSafeEqual(cookie, header)) return false;
    return this.verifyToken(sessionId, cookieToken);
  }

  private sign(sessionId: string, payload: string): string {
    return createHmac('sha256', this.options.secret)
      .update(`${sessionId}.${payload}`)
      .digest('base64url');
  }
}
