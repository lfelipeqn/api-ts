import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { VehicleVersion } from './VehicleVersion';
import { Client } from './Client';
import { MileageHistory } from './MileageHistory';

export class Vehicle extends Model {
  public id!: number;
  public license_plate!: string;
  public year!: number;
  public vehicle_version_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly vehicleVersion?: VehicleVersion;
  public readonly clients?: Client[];
  public readonly mileageHistories?: MileageHistory[];

  public static associations: {
    vehicleVersion: Association<Vehicle, VehicleVersion>;
    clients: Association<Vehicle, Client>;
    mileageHistories: Association<Vehicle, MileageHistory>;
  };

  static initModel(sequelize: Sequelize): typeof Vehicle {
    Vehicle.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      license_plate: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      vehicle_version_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'vehicles',
      timestamps: true,
      underscored: true,
    });

    return Vehicle;
  }

  static associate(models: any) {
    Vehicle.belongsTo(models.VehicleVersion, { foreignKey: 'vehicle_version_id', as: 'vehicleVersion' });
    Vehicle.belongsToMany(models.Client, { 
      through: 'clients_vehicles',
      foreignKey: 'vehicle_id',
      otherKey: 'client_id',
      as: 'clients'
    });
    Vehicle.hasMany(models.MileageHistory, { foreignKey: 'vehicle_id', as: 'mileageHistories' });
  }

  async updateInfo(license_plate: string, year: number, vehicle_version_id: number, km?: number): Promise<void> {
    await this.update({
      license_plate,
      year,
      vehicle_version_id
    });

    if (km !== undefined) {
      const lastMileageHistory = await this.lastMileageHistory();
      const updateKm = !lastMileageHistory || lastMileageHistory.km !== km;

      if (updateKm) {
        await MileageHistory.create({
          km,
          vehicle_id: this.id
        });
        
        // Note: The client reward logic is omitted as it requires access to the authenticated user,
        // which is typically handled differently in a Node.js/Express environment compared to Laravel.
      }
    }
  }

  async lastMileageHistory(): Promise<MileageHistory | null> {
    return await MileageHistory.findOne({
      where: { vehicle_id: this.id },
      order: [['id', 'DESC']]
    });
  }

  async currentOwner(): Promise<Client | null> {
    return await Client.findOne({
      include: [{
        model: Vehicle,
        as: 'vehicles',
        where: { id: this.id },
        through: { where: { state: 'Activo' } }
      }]
    });
  }

  // Note: The 'allowed' method is omitted as it relies on Laravel's Auth facade.
  // In a TypeScript/Express environment, you would typically handle authentication 
  // and authorization differently, often using middleware.
}