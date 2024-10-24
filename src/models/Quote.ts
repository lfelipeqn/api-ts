import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { PriceHistory } from './PriceHistory';
import { Client } from './Client';

export class Quote extends Model {
  public id!: number;
  public token!: string;
  public state!: number;
  public expiration_date!: Date;
  public amount!: number;
  public price_history_id!: number;
  public client_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly priceHistory?: PriceHistory;
  public readonly client?: Client;

  public static associations: {
    priceHistory: Association<Quote, PriceHistory>;
    client: Association<Quote, Client>;
  };

  static initModel(sequelize: Sequelize): typeof Quote {
    Quote.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      state: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      expiration_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      price_history_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'quotes',
      timestamps: true,
      underscored: true,
    });

    return Quote;
  }

  static associate(models: any) {
    Quote.belongsTo(models.PriceHistory, { foreignKey: 'price_history_id', as: 'priceHistory' });
    Quote.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
  }

  // Static methods (QuoteStatics equivalent)
  static async findByToken(token: string): Promise<Quote | null> {
    return Quote.findOne({ where: { token } });
  }

  static async findActiveForClient(clientId: number): Promise<Quote[]> {
    return Quote.findAll({
      where: {
        client_id: clientId,
        state: 1, // Assuming 1 represents an active state
      },
      include: ['priceHistory'],
    });
  }

  // Instance methods
  async isExpired(): Promise<boolean> {
    return new Date() > this.expiration_date;
  }

  async extend(days: number): Promise<void> {
    const newExpirationDate = new Date(this.expiration_date);
    newExpirationDate.setDate(newExpirationDate.getDate() + days);
    await this.update({ expiration_date: newExpirationDate });
  }

  // You can add more methods here as needed
}