// src/models/Permission.ts

import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Role } from './Role';

export interface PermissionAttributes {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PermissionCreationAttributes extends Omit<PermissionAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class Permission extends Model<PermissionAttributes, PermissionCreationAttributes> {
  declare id: number;
  declare name: string;
  declare description: string | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  declare readonly roles?: Role[];

  public static associations: {
    roles: Association<Permission, Role>;
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
        unique: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'permissions',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['name']
        }
      ]
    });

    return Permission;
  }

  static associate(models: {
    Role: typeof Role;
  }): void {
    Permission.belongsToMany(models.Role, {
      through: 'role_permissions',
      foreignKey: 'permission_id',
      otherKey: 'role_id',
      as: 'roles'
    });
  }
}