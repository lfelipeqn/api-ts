import { Model, DataTypes, Sequelize, Association, Op } from 'sequelize';
import { Permission } from './Permission';
import { User } from './User';
import { PermissionRegistrar } from '../services/PermissionRegistrar';
import { RoleAlreadyExists, RoleDoesNotExist, PermissionDoesNotExist, GuardDoesNotMatch } from '../exceptions';

export class Role extends Model {
  public id!: number;
  public name!: string;
  public guard_name!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly permissions?: Permission[];
  public readonly users?: User[];

  public static associations: {
    permissions: Association<Role, Permission>;
    users: Association<Role, User>;
  };

  static initModel(sequelize: Sequelize): typeof Role {
    Role.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      guard_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'roles',
      timestamps: true,
      underscored: true,
    });

    return Role;
  }

  static associate(models: any) {
    Role.belongsToMany(models.Permission, {
      through: 'role_has_permissions',
      foreignKey: 'role_id',
      otherKey: 'permission_id',
      as: 'permissions'
    });
    Role.belongsToMany(models.User, {
      through: 'model_has_roles',
      foreignKey: 'role_id',
      otherKey: 'model_id',
      as: 'users'
    });
  }

  static async create(attributes: any): Promise<Role> {
    const guardName = attributes.guard_name || PermissionRegistrar.getDefaultName();
    const params = { name: attributes.name, guard_name: guardName };

    if (PermissionRegistrar.teams) {
      const teamsKey = PermissionRegistrar.teamsKey;
      if (attributes[teamsKey]) {
        params[teamsKey] = attributes[teamsKey];
      } else {
        params[teamsKey] = await PermissionRegistrar.getPermissionsTeamId();
      }
    }

    const existingRole = await Role.findByParam(params);
    if (existingRole) {
      throw new RoleAlreadyExists(attributes.name, guardName);
    }

    return super.create(attributes);
  }

  static async findByName(name: string, guardName?: string): Promise<Role> {
    guardName = guardName || PermissionRegistrar.getDefaultName();
    const role = await Role.findByParam({ name, guard_name: guardName });

    if (!role) {
      throw new RoleDoesNotExist(name, guardName);
    }

    return role;
  }

  static async findById(id: number | string, guardName?: string): Promise<Role> {
    guardName = guardName || PermissionRegistrar.getDefaultName();
    const role = await Role.findByParam({ id, guard_name: guardName });

    if (!role) {
      throw new RoleDoesNotExist(id, guardName);
    }

    return role;
  }

  static async findOrCreate(name: string, guardName?: string): Promise<Role> {
    guardName = guardName || PermissionRegistrar.getDefaultName();
    let role = await Role.findByParam({ name, guard_name: guardName });

    if (!role) {
      const attributes: any = { name, guard_name: guardName };
      if (PermissionRegistrar.teams) {
        attributes[PermissionRegistrar.teamsKey] = await PermissionRegistrar.getPermissionsTeamId();
      }
      role = await Role.create(attributes);
    }

    return role;
  }

  private static async findByParam(params: any): Promise<Role | null> {
    const query: any = {};

    if (PermissionRegistrar.teams) {
      const teamsKey = PermissionRegistrar.teamsKey;
      query[teamsKey] = {
        [Op.or]: [null, params[teamsKey] || await PermissionRegistrar.getPermissionsTeamId()]
      };
      delete params[teamsKey];
    }

    Object.assign(query, params);

    return Role.findOne({ where: query });
  }

  async hasPermissionTo(permission: string | number | Permission, guardName?: string): Promise<boolean> {
    if (PermissionRegistrar.getWildcardClass()) {
      return this.hasWildcardPermission(permission, guardName);
    }

    const permissionInstance = await this.filterPermission(permission, guardName);

    if (!this.getGuardNames().includes(permissionInstance.guard_name)) {
      throw new GuardDoesNotMatch(permissionInstance.guard_name, guardName || this.getGuardNames());
    }

    const permissions = await this.$get('permissions');
    return permissions.some(p => p.id === permissionInstance.id);
  }

  private async filterPermission(permission: string | number | Permission, guardName?: string): Promise<Permission> {
    if (typeof permission === 'string') {
      return Permission.findByName(permission, guardName);
    }

    if (typeof permission === 'number') {
      return Permission.findById(permission, guardName);
    }

    return permission;
  }

  private getGuardNames(): string[] {
    return [this.guard_name];
  }

  // Implement other methods like hasWildcardPermission if needed
}