// src/models/RolePermission.ts

import { Model, DataTypes, Sequelize } from 'sequelize';

interface RolePermissionAttributes {
  role_id: number;
  permission_id: number;
  created_at: Date;
  updated_at: Date;
}

interface RolePermissionCreationAttributes extends Omit<RolePermissionAttributes, 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class RolePermission extends Model<RolePermissionAttributes, RolePermissionCreationAttributes> {
  declare role_id: number;
  declare permission_id: number;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  static initModel(sequelize: Sequelize): typeof RolePermission {
    RolePermission.init({
      role_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        references: {
          model: 'roles',
          key: 'id'
        }
      },
      permission_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        references: {
          model: 'permissions',
          key: 'id'
        }
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'role_permissions',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['role_id']
        },
        {
          fields: ['permission_id']
        }
      ]
    });

    return RolePermission;
  }
}