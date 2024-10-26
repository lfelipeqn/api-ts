import { 
  Model, 
  DataTypes, 
  Sequelize, 
  Association, 
  Op, 
  fn, 
  col,
  QueryTypes as SequelizeQueryTypes
} from 'sequelize';
import { User } from './User';
import { City } from './City';
import { Agency } from './Agency';
import { Department } from './Department';
import { AddressType, AddressAttributes, AddressCreationAttributes, ADDRESS_TYPES, AddressCountResult } from '../types/address';

export class Address extends Model<AddressAttributes, AddressCreationAttributes> {
  declare id: number;
  declare name: string | null;
  declare neighborhood: string | null;
  declare detail: string;
  declare user_id: number;
  declare city_id: number;
  declare via: string | null;
  declare via_identification: string | null;
  declare number: string | null;
  declare is_default: boolean;
  declare type: AddressType;

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  declare readonly user?: User;
  declare readonly city?: City;

  public static associations: {
    user: Association<Address, User>;
    city: Association<Address, City>;
  };

  static validateType(type: string): type is AddressType {
    return ADDRESS_TYPES.includes(type as AddressType);
  }

  static getTypes(): AddressType[] {
    return [...ADDRESS_TYPES];
  }

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
      user_id: {
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
      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      type: {
        type: DataTypes.ENUM(...ADDRESS_TYPES),
        allowNull: false,
        defaultValue: 'SHIPPING',
        validate: {
          isIn: {
            args: [ADDRESS_TYPES],
            msg: 'Invalid address type'
          }
        }
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'addresses',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['user_id']
        },
        {
          fields: ['city_id']
        },
        {
          fields: ['type']
        },
        {
          fields: ['user_id', 'type', 'is_default']
        }
      ],
      hooks: {
        beforeValidate: async (address: Address) => {
          // Validate type before saving
          if (!Address.validateType(address.type)) {
            throw new Error(`Invalid address type: ${address.type}`);
          }
        },
        beforeCreate: async (address: Address) => {
          if (address.is_default) {
            await Address.update(
              { is_default: false },
              { 
                where: { 
                  user_id: address.user_id,
                  type: address.type 
                } 
              }
            );
          }
        },
        beforeUpdate: async (address: Address) => {
          if (address.is_default) {
            await Address.update(
              { is_default: false },
              { 
                where: { 
                  user_id: address.user_id,
                  type: address.type,
                  id: { [Op.ne]: address.id }
                } 
              }
            );
          }
        }
      }
    });

    return Address;
  }

  static associate(models: any) {
    Address.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
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

  // Enhanced methods for user address management
  static async getDefaultAddress(userId: number, type: AddressType): Promise<Address | null> {
    if (!this.validateType(type)) {
      throw new Error(`Invalid address type: ${type}`);
    }

    return Address.findOne({
      where: {
        user_id: userId,
        type,
        is_default: true
      },
      include: [{
        model: City,
        as: 'city',
        include: [{
          model: Department,
          as: 'department'
        }]
      }]
    });
  }

  static async setDefaultAddress(addressId: number, userId: number): Promise<Address> {
    const address = await Address.findOne({
      where: {
        id: addressId,
        user_id: userId
      }
    });

    if (!address) {
      throw new Error('Address not found');
    }

    await Address.update(
      { is_default: false },
      { 
        where: { 
          user_id: userId,
          type: address.type 
        } 
      }
    );

    await address.update({ is_default: true });
    return address;
  }

  static async getUserAddresses(
    userId: number, 
    type?: AddressType
  ): Promise<Address[]> {
    if (type && !this.validateType(type)) {
      throw new Error(`Invalid address type: ${type}`);
    }

    const where: any = { user_id: userId };
    if (type) {
      where.type = type;
    }

    return Address.findAll({
      where,
      include: [{
        model: City,
        as: 'city',
        include: [{
          model: Department,
          as: 'department'
        }]
      }],
      order: [
        ['is_default', 'DESC'],
        ['created_at', 'DESC']
      ]
    });
  }

  // New method to get count of addresses by type
  static async getAddressCountByType(userId: number): Promise<Record<AddressType, number>> {
    const sequelize = this.sequelize!;
    
    const counts = await sequelize.query<AddressCountResult>(
      `SELECT type, COUNT(id) as count 
       FROM ${this.tableName} 
       WHERE user_id = :userId 
       GROUP BY type`,
      {
        replacements: { userId },
        type: SequelizeQueryTypes.SELECT
      }
    );

    return ADDRESS_TYPES.reduce((acc, type) => {
      const found = counts.find(c => c.type === type);
      acc[type] = found ? Number(found.count) : 0;
      return acc;
    }, {} as Record<AddressType, number>);
  }


  // New method to check if user has reached maximum addresses of a type
  static async hasReachedTypeLimit(userId: number, type: AddressType, limit: number): Promise<boolean> {
    if (!this.validateType(type)) {
      throw new Error(`Invalid address type: ${type}`);
    }

    const count = await this.count({
      where: { 
        user_id: userId,
        type
      }
    });

    return count >= limit;
  }
}