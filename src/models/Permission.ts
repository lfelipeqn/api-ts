import { Model, DataTypes, Sequelize, Association, Op } from 'sequelize';
import { Role } from './Role';
import { User } from './User';
import { PermissionRegistrar } from '../services/PermissionRegistrar';
import { PermissionAlreadyExists, PermissionDoesNotExist } from '../exceptions';

export class Permission extends Model {
  public id!: number;
  public name!: string;
  public guard_name!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly roles?: Role[];
  public readonly users?: User[];

  public static associations: {
    roles: Association<Permission, Role>;
    users: Association<Permission, User>;
  };

  static initModel(sequelize: Sequelize): typeof Permission {
    Permission.init({
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
      tableName: 'permissions',
      timestamps: true,
      underscored: true,
    });

    return Permission;
  }

  static associate(models: any) {
    Permission.belongsToMany(models.Role, {
      through: 'role_has_permissions',
      foreignKey: 'permission_id',
      otherKey: 'role_id',
      as: 'roles'
    });
    Permission.belongsToMany(models.User, {
      through: 'model_has_permissions',
      foreignKey: 'permission_id',
      otherKey: 'model_id',
      as: 'users'
    });
  }

  static async create(attributes: any): Promise<Permission> {
    const guardName = attributes.guard_name || PermissionRegistrar.getDefaultName();
    const permission = await Permission.getPermission({ name: attributes.name, guard_name: guardName });

    if (permission) {
      throw new PermissionAlreadyExists(attributes.name, guardName);
    }

    return super.create({ ...attributes, guard_name: guardName });
  }

  static async findByName(name: string, guardName?: string): Promise<Permission> {
    guardName = guardName || PermissionRegistrar.getDefaultName();
    const permission = await Permission.getPermission({ name, guard_name: guardName });

    if (!permission) {
      throw new PermissionDoesNotExist(name, guardName);
    }

    return permission;
  }

  static async findById(id: number | string, guardName?: string): Promise<Permission> {
    guardName = guardName || PermissionRegistrar.getDefaultName();
    const permission = await Permission.getPermission({ id, guard_name: guardName });

    if (!permission) {
      throw new PermissionDoesNotExist(id, guardName);
    }

    return permission;
  }

  static async findOrCreate(name: string, guardName?: string): Promise<Permission> {
    guardName = guardName || PermissionRegistrar.getDefaultName();
    let permission = await Permission.getPermission({ name, guard_name: guardName });

    if (!permission) {
      permission = await Permission.create({ name, guard_name: guardName });
    }

    return permission;
  }

  private static async getPermissions(params: any = {}, onlyOne: boolean = false): Promise<Permission[]> {
    const query = PermissionRegistrar.getPermissions(params, onlyOne);
    return Permission.findAll(query);
  }

  private static async getPermission(params: any = {}): Promise<Permission | null> {
    const permissions = await this.getPermissions(params, true);
    return permissions[0] || null;
  }
}