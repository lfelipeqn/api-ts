// src/services/RoleService.ts

import { Role } from '../models/Role';
import { Permission } from '../models/Permission';
import { User } from '../models/User';
import { Transaction } from 'sequelize';

export class RoleService {
  private static instance: RoleService;

  private constructor() {}

  public static getInstance(): RoleService {
    if (!RoleService.instance) {
      RoleService.instance = new RoleService();
    }
    return RoleService.instance;
  }

  /**
   * Initialize default roles and permissions in the system
   */
  public async initializeRolesAndPermissions(): Promise<void> {
    const t = await Role.sequelize!.transaction();

    try {
      // Create default permissions
      const permissions = await this.createDefaultPermissions(t);
      
      // Create admin role
      const adminRole = await this.getOrCreateRole(
        'ADMINISTRATOR',
        'Full system access',
        false,
        t
      );

      // Create customer role
      const customerRole = await this.getOrCreateRole(
        'CUSTOMER',
        'Regular customer access',
        true, // customer is the default role
        t
      );

      // Assign all permissions to admin role
      await adminRole.addPermissions(permissions, { transaction: t });
      
      // Assign basic permissions to customer role
      const customerPermissions = permissions.filter(p => 
        p.name.startsWith('product.view') || 
        p.name === 'cart.manage' || 
        p.name === 'order.create' ||
        p.name === 'order.view_own' ||
        p.name === 'profile.manage'
      );
      
      await customerRole.addPermissions(customerPermissions, { transaction: t });

      await t.commit();
      console.log('Roles and permissions initialized successfully');
    } catch (error) {
      await t.rollback();
      console.error('Error initializing roles and permissions:', error);
      throw error;
    }
  }

  /**
   * Create default permissions if they don't exist
   */
  private async createDefaultPermissions(transaction?: Transaction): Promise<Permission[]> {
    const defaultPermissions = [
      { name: 'product.view', description: 'View products' },
      { name: 'product.manage', description: 'Create, update and delete products' },
      { name: 'order.view', description: 'View orders' },
      { name: 'order.manage', description: 'Manage orders' },
      { name: 'order.view_own', description: 'View own orders' },
      { name: 'order.create', description: 'Place new orders' },
      { name: 'customer.view', description: 'View customer information' },
      { name: 'customer.manage', description: 'Manage customer accounts' },
      { name: 'cart.manage', description: 'Manage own shopping cart' },
      { name: 'profile.manage', description: 'Manage own profile information' },
      { name: 'report.view', description: 'View system reports' },
      { name: 'system.manage', description: 'Manage system settings' },
      { name: 'payment.process', description: 'Process payments' },
      { name: 'payment.refund', description: 'Process refunds' },
      { name: 'inventory.view', description: 'View inventory' },
      { name: 'inventory.manage', description: 'Manage inventory levels' },
      { name: 'promotion.view', description: 'View promotions' },
      { name: 'promotion.manage', description: 'Manage promotions' },
      { name: 'merchant.sync', description: 'Sync with merchant platforms' }
    ];

    const permissions: Permission[] = [];

    for (const permData of defaultPermissions) {
      const [permission] = await Permission.findOrCreate({
        where: { name: permData.name },
        defaults: permData,
        transaction
      });
      permissions.push(permission);
    }

    return permissions;
  }

  /**
   * Get or create a role
   */
  private async getOrCreateRole(
    name: string,
    description: string,
    isDefault: boolean = false,
    transaction?: Transaction
  ): Promise<Role> {
    const [role] = await Role.findOrCreate({
      where: { name },
      defaults: {
        name,
        description,
        is_default: isDefault
      },
      transaction
    });

    return role;
  }

  /**
   * Assign default role to user
   */
  public async assignDefaultRoleToUser(
    user: User,
    transaction?: Transaction
  ): Promise<void> {
    const defaultRole = await Role.getDefaultRole();
    if (defaultRole) {
      await user.addRole(defaultRole, { transaction });
    } else {
      console.warn('No default role found for assigning to new user');
    }
  }

  /**
   * Assign admin role to user
   */
  public async assignAdminRoleToUser(
    user: User,
    transaction?: Transaction
  ): Promise<void> {
    const adminRole = await Role.getAdminRole();
    if (adminRole) {
      await user.addRole(adminRole, { transaction });
    } else {
      throw new Error('Admin role not found');
    }
  }

  /**
   * Check if user has permission
   */
  public async userHasPermission(
    user: User,
    permissionName: string
  ): Promise<boolean> {
    await user.reloadWithRolesAndPermissions();
    
    if (!user.roles) {
      return false;
    }

    // Check each role
    for (const role of user.roles) {
      if (!role.permissions) continue;
      
      // Check if any permission matches
      if (role.permissions.some(p => p.name === permissionName)) {
        return true;
      }
    }

    return false;
  }
}
