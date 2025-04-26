// src/models/Role.ts

import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { User } from './User';
import { Permission } from './Permission';

export const ROLE_TYPES = ['ADMINISTRATOR', 'CUSTOMER'] as const;
export type RoleType = typeof ROLE_TYPES[number];

export interface RoleAttributes {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RoleCreationAttributes extends Omit<RoleAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class Role extends Model<RoleAttributes, RoleCreationAttributes> {
  declare id: number;
  declare name: string;
  declare description: string | null;
  declare is_default: boolean;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  declare readonly users?: User[];
  declare readonly permissions?: Permission[];

  public static associations: {
    users: Association<Role, User>;
    permissions: Association<Role, Permission>;
  };

  public addPermissions!: (permissions: Permission[], options?: any) => Promise<any>;
  public getPermissions!: () => Promise<Permission[]>;
  public setPermissions!: (permissions: Permission[], options?: any) => Promise<any>;
  public hasPermission!: (permission: Permission, options?: any) => Promise<boolean>;

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
        unique: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'roles',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['name']
        }
      ]
    });

    return Role;
  }

  static associate(models: {
    User: typeof User;
    Permission: typeof Permission;
  }): void {
    Role.belongsToMany(models.User, {
      through: 'user_roles',
      foreignKey: 'role_id',
      otherKey: 'user_id',
      as: 'users'
    });

    Role.belongsToMany(models.Permission, {
      through: 'role_permissions',
      foreignKey: 'role_id',
      otherKey: 'permission_id',
      as: 'permissions'
    });
  }

  static async getDefaultRole(): Promise<Role | null> {
    return Role.findOne({
      where: { is_default: true }
    });
  }

  static async getAdminRole(): Promise<Role | null> {
    return Role.findOne({
      where: { name: 'ADMINISTRATOR' }
    });
  }

  static async getCustomerRole(): Promise<Role | null> {
    return Role.findOne({
      where: { name: 'CUSTOMER' }
    });
  }


}