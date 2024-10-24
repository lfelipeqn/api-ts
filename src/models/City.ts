import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Department } from './Department';

export class City extends Model {
  public id!: number;
  public name!: string;
  public enabled_for_orders!: boolean;
  public payment_against_delivery_enabled!: boolean;
  public department_id!: number;

  // Associations
  public readonly department?: Department;

  public static associations: {
    department: Association<City, Department>;
  };

  static initModel(sequelize: Sequelize): typeof City {
    City.init({
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
      payment_against_delivery_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      department_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'cities',
      timestamps: false,  // As per the Laravel model
    });

    return City;
  }

  static associate(models: any) {
    City.belongsTo(models.Department, { foreignKey: 'department_id', as: 'department' });
    // Add other relationships as needed
  }

  cityIsEnabled(): boolean {
    return this.enabled_for_orders === true;
  }

  static async isEnabled(id: number): Promise<boolean> {
    const city = await City.findByPk(id);
    if (city) {
      return city.cityIsEnabled();
    }
    return false;
  }
}