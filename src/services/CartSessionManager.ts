import { Cache } from './Cache';
import { CartSession } from '../types/cart';

export class CartSessionManager {
  private static instance: CartSessionManager;
  private cache: Cache;
  private readonly prefix: string = 'cart_session:';
  private readonly defaultExpiration: number = 30 * 24 * 60 * 60; // 30 days in seconds

  private constructor() {
    this.cache = Cache.getInstance();
  }

  public static getInstance(): CartSessionManager {
    if (!CartSessionManager.instance) {
      CartSessionManager.instance = new CartSessionManager();
    }
    return CartSessionManager.instance;
  }

  public async createSession(
    cartId: number, 
    userId?: number,
    specificSessionId?: string
  ): Promise<string> {
    const sessionId = specificSessionId || this.generateSessionId();
    const session: CartSession = {
      cart_id: cartId,
      user_id: userId,
      created_at: new Date(),
      expires_at: new Date(Date.now() + (this.defaultExpiration * 1000))
    };

    await this.cache.set(
      this.getKey(sessionId),
      session,
      this.defaultExpiration
    );

    return sessionId;
  }

  public generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  public async getSession(sessionId: string): Promise<CartSession | null> {
    return this.cache.get<CartSession>(this.getKey(sessionId));
  }

  public async updateSession(
    sessionId: string,
    data: Partial<CartSession>
  ): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const updatedSession = {
      ...session,
      ...data
    };

    return this.cache.set(
      this.getKey(sessionId),
      updatedSession,
      this.defaultExpiration
    );
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    return this.cache.del(this.getKey(sessionId));
  }

  public async extendSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    session.expires_at = new Date(Date.now() + (this.defaultExpiration * 1000));
    return this.cache.set(
      this.getKey(sessionId),
      session,
      this.defaultExpiration
    );
  }

  private getKey(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }
}