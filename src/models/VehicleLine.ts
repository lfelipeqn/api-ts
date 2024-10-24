import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Brand } from './Brand';
import { VehicleVersion } from './VehicleVersion';

export class VehicleLine extends Model {
  public id!: number;
  public name!: string;
  public type!: string;
  public brand_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly brand?: Brand;
  public readonly vehicleVersions?: VehicleVersion[];

  public static associations: {
    brand: Association<VehicleLine, Brand>;
    vehicleVersions: Association<VehicleLine, VehicleVersion>;
  };

  static initModel(sequelize: Sequelize): typeof VehicleLine {
    VehicleLine.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      brand_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'vehicle_lines',
      timestamps: true,
      underscored: true,
    });

    return VehicleLine;
  }

  static associate(models: any) {
    VehicleLine.belongsTo(models.Brand, { foreignKey: 'brand_id', as: 'brand' });
    VehicleLine.hasMany(models.VehicleVersion, { foreignKey: 'vehicle_line_id', as: 'vehicleVersions' });
  }

  // You can add custom methods here if needed
}