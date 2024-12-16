import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class PasswordHandler {
  private static readonly BCRYPT_ROUNDS = 10;
  private static readonly TOKEN_EXPIRY = 60 * 60 * 24; // 24 hours in seconds

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      if (!hash || hash.trim() === '') {
        return false;
      }
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  static generateResetToken(): string {
    const randomBytes = crypto.randomBytes(32);
    const timestamp = Date.now().toString();
    const hash = crypto.createHash('sha256')
      .update(randomBytes)
      .update(timestamp)
      .digest('hex');
    return hash;
  }

  static getTokenExpiry(): Date {
    return new Date(Date.now() + (this.TOKEN_EXPIRY * 1000));
  }

  static isTokenExpired(tokenCreationDate: Date): boolean {
    const expiryDate = new Date(tokenCreationDate.getTime() + (this.TOKEN_EXPIRY * 1000));
    return expiryDate < new Date();
  }
}