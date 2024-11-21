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
    userId: number | null = null,
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
    console.log('Getting cart session:', sessionId);
    const session = await this.cache.get<CartSession>(this.getKey(sessionId));
    console.log('Cart session result:', session);
    return session;
  }

  public async updateSession(
    sessionId: string,
    data: Partial<CartSession>
  ): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const updatedSession: CartSession = {
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

  public async findCartSessionsByUserId(userId: number): Promise<CartSession[]> {
    try {
      const pattern = `${this.prefix}*`;
      const sessions = await this.cache.findByPattern<CartSession>(pattern);
      
      return sessions
        .filter(({ value }) => value.user_id === userId)
        .map(({ value }) => value);
    } catch (error) {
      console.error('Error finding cart sessions by user ID:', error);
      return [];
    }
  }

  private getKey(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  public async ensureSession(
    cartId: number,
    sessionId: string,
    userId: number | null = null
  ): Promise<void> {
    const exists = await this.cache.exists(this.getKey(sessionId));
    if (!exists) {
      console.log('Recreating missing cart session:', { cartId, sessionId, userId });
      await this.createSession(cartId, userId, sessionId);
    }
  }
}