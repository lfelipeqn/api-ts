// src/models/UserRole.ts

import { Model, DataTypes, Sequelize } from 'sequelize';

interface UserRoleAttributes {
  user_id: number;
  role_id: number;
  created_at: Date;
  updated_at: Date;
}

interface UserRoleCreationAttributes extends Omit<UserRoleAttributes, 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export class UserRole extends Model<UserRoleAttributes, UserRoleCreationAttributes> {
  declare user_id: number;
  declare role_id: number;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  static initModel(sequelize: Sequelize): typeof UserRole {
    UserRole.init({
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      role_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        references: {
          model: 'roles',
          key: 'id'
        }
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'user_roles',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['user_id']
        },
        {
          fields: ['role_id']
        }
      ]
    });

    return UserRole;
  }
}