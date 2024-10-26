import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class PasswordHandler {
  private static readonly BCRYPT_ROUNDS = 10;
  private static readonly LARAVEL_HASH_PREFIX = '$2y$';
  private static readonly NODE_HASH_PREFIX = '$2b$';
  private static readonly TOKEN_EXPIRY = 60 * 60 * 24; // 24 hours in seconds

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const nodeHash = this.convertLaravelHashToNode(hash);
      return await bcrypt.compare(password, nodeHash);
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  private static convertLaravelHashToNode(hash: string): string {
    if (hash.startsWith(this.LARAVEL_HASH_PREFIX)) {
      return hash.replace(this.LARAVEL_HASH_PREFIX, this.NODE_HASH_PREFIX);
    }
    return hash;
  }

  static generateResetToken(): string {
    // Generate a secure random token
    const randomBytes = crypto.randomBytes(32);
    // Create timestamp to make token unique even with same random bytes
    const timestamp = Date.now().toString();
    // Combine and hash to create final token
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