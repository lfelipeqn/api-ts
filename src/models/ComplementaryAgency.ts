import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Agency } from './Agency';
import { OrderPriceHistory } from './OrderPriceHistory';
import { ProductTransfer } from './ProductTrasfer';

export class ComplementaryAgency extends Model {
  public id!: number;
  public amount!: number;
  public transferred_to_virtual!: boolean;
  public state!: string;
  public magister_stock_sync_status!: number;
  public order_price_history_id!: number;
  public agency_id!: number;
  public product_transfer_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly agency?: Agency;
  public readonly orderPriceHistory?: OrderPriceHistory;
  public readonly productTransfer?: ProductTransfer;

  public static associations: {
    agency: Association<ComplementaryAgency, Agency>;
    orderPriceHistory: Association<ComplementaryAgency, OrderPriceHistory>;
    productTransfer: Association<ComplementaryAgency, ProductTransfer>;
  };

  static initModel(sequelize: Sequelize): typeof ComplementaryAgency {
    ComplementaryAgency.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      transferred_to_virtual: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      magister_stock_sync_status: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      order_price_history_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      product_transfer_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'complementary_agencies',
      timestamps: true,
      underscored: true,
    });

    return ComplementaryAgency;
  }

  static associate(models: any) {
    ComplementaryAgency.belongsTo(models.Agency, { foreignKey: 'agency_id', as: 'agency' });
    ComplementaryAgency.belongsTo(models.OrderPriceHistory, { foreignKey: 'order_price_history_id', as: 'orderPriceHistory' });
    ComplementaryAgency.belongsTo(models.ProductTransfer, { foreignKey: 'product_transfer_id', as: 'productTransfer' });
    // Add other relationships as needed
  }

  // You can add custom query methods here to replicate the functionality of ComplementaryAgencyQueryFactory
}