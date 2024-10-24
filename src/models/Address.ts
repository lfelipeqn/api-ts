import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Client } from './Client';
import { City } from './City';
import { Agency } from './Agency';
import { Department } from './Department';

export class Address extends Model {
  public id!: number;
  public name!: string | null;
  public neighborhood!: string | null;
  public detail!: string;
  public client_id!: number;
  public city_id!: number;
  public via!: string | null;
  public via_identification!: string | null;
  public number!: string | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly client?: Client;
  public readonly city?: City;

  public static associations: {
    client: Association<Address, Client>;
    city: Association<Address, City>;
  };

  static initModel(sequelize: Sequelize): typeof Address {
    Address.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      neighborhood: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      detail: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      city_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      via: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      via_identification: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'addresses',
      timestamps: true,
      underscored: true,
    });

    return Address;
  }

  static associate(models: any) {
    Address.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    Address.belongsTo(models.City, { foreignKey: 'city_id', as: 'city' });
  }

  async addressToString(): Promise<string> {
    await this.reload({
      include: [{
        model: City,
        as: 'city',
        include: [{
          model: Department,
          as: 'department'
        }]
      }]
    });

    return `${this.name ? `(${this.name}) ` : ''}${this.detail}${
      this.neighborhood ? ` / Barrio ${this.neighborhood}` : ''
    } / ${this.city!.name}-${this.city!.department!.name}`;
  }

  async assignAddressToDescription(): Promise<void> {
    await this.update({
      via: null,
      via_identification: null,
      number: null,
      detail: `${this.via} ${this.via_identification}${
        this.number ? ` # ${this.number}` : ''
      }${this.detail ? ` -- ${this.detail}` : ''}`,
    });
  }

  static async assignAllAddressesToDescription(): Promise<void> {
    const addresses = await Address.findAll();
    for (const address of addresses) {
      await address.assignAddressToDescription();
    }
  }

  async cityHasAgency(): Promise<boolean> {
    const count = await Address.count({
      include: [{
        model: Agency,
        as: 'agency',
        where: { state: 'Activo' },
      }],
      where: { city_id: this.city_id },
    });

    return count > 0;
  }
}