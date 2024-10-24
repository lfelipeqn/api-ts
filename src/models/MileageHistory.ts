import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Vehicle } from './Vehicle';

export class MileageHistory extends Model {
  public id!: number;
  public km!: number;
  public vehicle_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly vehicle?: Vehicle;

  public static associations: {
    vehicle: Association<MileageHistory, Vehicle>;
  };

  static initModel(sequelize: Sequelize): typeof MileageHistory {
    MileageHistory.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      km: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      vehicle_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'mileage_histories',
      timestamps: true,
      underscored: true,
    });

    return MileageHistory;
  }

  static associate(models: any) {
    MileageHistory.belongsTo(models.Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
  }

  // You can add query factory methods here
  static async findLatestForVehicle(vehicleId: number): Promise<MileageHistory | null> {
    return this.findOne({
      where: { vehicle_id: vehicleId },
      order: [['created_at', 'DESC']],
    });
  }

  // You can add more methods here if needed
}