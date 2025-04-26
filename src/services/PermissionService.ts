import { User } from '../models/User';
import { RoleService } from './RoleService';

export class PermissionService {
  private static instance: PermissionService;
  private roleService: RoleService;

  private constructor() {
    this.roleService = RoleService.getInstance();
  }

  public static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  /**
   * Check if user has a specific permission
   */
  public async hasPermission(user: User, permission: string): Promise<boolean> {
    return this.roleService.userHasPermission(user, permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  public async hasAnyPermission(user: User, permissions: string[]): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(user, permission)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user has all of the specified permissions
   */
  public async hasAllPermissions(user: User, permissions: string[]): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(user, permission))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all permissions for a user
   */
  public async getUserPermissions(user: User): Promise<string[]> {
    await user.reloadWithRolesAndPermissions();
    if (!user.roles) {
      return [];
    }

    const permissions = new Set<string>();
    
    for (const role of user.roles) {
      if (!role.permissions) continue;
      
      for (const permission of role.permissions) {
        permissions.add(permission.name);
      }
    }
    
    return Array.from(permissions);
  }

  /**
   * Invalidates the permission cache for a specific user
   */
  public async invalidateUserPermissionCache(userId: number): Promise<void> {
    // Implementation to clear cache for the user's permissions
    // If you have a caching mechanism, clear the user permissions here
    console.log(`Invalidated permission cache for user ${userId}`);
  }
}