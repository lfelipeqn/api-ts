import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { City } from './City';

export class Department extends Model {
  declare id: number;
  declare name: string;
  declare enabled_for_orders: boolean;

  // Associations
  public readonly cities?: City[];

  public static associations: {
    cities: Association<Department, City>;
  };

  static initModel(sequelize: Sequelize): typeof Department {
    Department.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      enabled_for_orders: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    }, {
      sequelize,
      tableName: 'departments',
      timestamps: false,  // As per the Laravel model
    });

    return Department;
  }

  static associate(models: any) {
    Department.hasMany(models.City, { foreignKey: 'department_id', as: 'cities' });
    // Add other relationships as needed
  }
}