import { User } from '../models/User';
import { Cache } from './Cache';
import { randomBytes } from 'crypto';

interface UserSession {
  id: number;
  email: string;
  state: string;
  person_id: number;
  agency_id: number | null;
  product_line_id: number | null;
  //permissions: string[];
  //roles: string[];
  created_at: Date;
}

interface SessionConfig {
  prefix: string;
  expiration: number; // in seconds
}

export class UserSessionManager {
  private static instance: UserSessionManager;
  private cache: Cache;
  private readonly config: SessionConfig = {
    prefix: 'user_session:',
    expiration: 24 * 60 * 60 // 24 hours
  };

  private constructor() {
    this.cache = Cache.getInstance();
  }

  public static getInstance(): UserSessionManager {
    if (!UserSessionManager.instance) {
      UserSessionManager.instance = new UserSessionManager();
    }
    return UserSessionManager.instance;
  }

  /**
   * Create a new session for a user
   */
  public async createSession(user: User): Promise<string> {
    const sessionId = await this.generateSessionId();
    const sessionData = await this.createSessionData(user);
    
    await this.cache.set(
      this.getSessionKey(sessionId),
      sessionData,
      this.config.expiration
    );

    return sessionId;
  }

  /**
   * Get session data for a given session ID
   */
  public async getSession(sessionId: string): Promise<UserSession | null> {
    return this.cache.get<UserSession>(this.getSessionKey(sessionId));
  }

  /**
   * Update existing session data
   */
  public async updateSession(sessionId: string, data: Partial<UserSession>): Promise<boolean> {
    const currentSession = await this.getSession(sessionId);
    if (!currentSession) {
      return false;
    }

    const updatedSession = {
      ...currentSession,
      ...data
    };

    return this.cache.set(
      this.getSessionKey(sessionId),
      updatedSession,
      this.config.expiration
    );
  }

  /**
   * Extend session expiration
   */
  public async extendSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    return this.cache.set(
      this.getSessionKey(sessionId),
      session,
      this.config.expiration
    );
  }

  /**
   * Destroy a session
   */
  public async destroySession(sessionId: string): Promise<boolean> {
    return this.cache.del(this.getSessionKey(sessionId));
  }

  /**
   * Destroy all sessions for a user
   */
  public async destroyUserSessions(userId: number): Promise<boolean> {
    const pattern = `${this.config.prefix}*:${userId}`;
    return this.cache.clearPattern(pattern);
  }

  /**
   * Check if a session is valid
   */
  public async isValidSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session !== null;
  }

  /**
   * Generate a unique session ID
   */
  private async generateSessionId(): Promise<string> {
    return new Promise((resolve, reject) => {
      randomBytes(32, (err, buf) => {
        if (err) reject(err);
        resolve(buf.toString('hex'));
      });
    });
  }

  /**
   * Create session data from user model
   */
  private async createSessionData(user: User): Promise<UserSession> {
    // Load user associations if they haven't been loaded
    const fullUser = await user.getInfo();
    
    return {
      id: user.id,
      email: user.email,
      state: user.state,
      person_id: user.person_id,
      agency_id: user.agency_id,
      product_line_id: user.product_line_id,
      //permissions: (fullUser.permissions || []).map(p => p.name),
      //roles: (fullUser.roles || []).map(r => r.name),
      created_at: new Date()
    };
  }

  /**
   * Get Redis key for session
   */
  private getSessionKey(sessionId: string): string {
    return `${this.config.prefix}${sessionId}`;
  }
}