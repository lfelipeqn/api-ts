import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Agency } from './Agency';
import { Product } from './Product';

interface AgencyProductAttributes {
  id: number;
  current_stock: number;
  state: boolean;
  product_id: number;
  agency_id: number;
}
interface AgencyProductCreationAttributes
  extends Omit<AgencyProductAttributes, 'id'> {}

export class AgencyProduct extends Model<AgencyProductAttributes, AgencyProductCreationAttributes> {
  declare id: number;
  declare current_stock: number;
  declare state: boolean;
  declare product_id: number;
  declare agency_id: number;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly agency?: Agency;
  public readonly product?: Product;

  public static associations: {
    agency: Association<AgencyProduct, Agency>;
    product: Association<AgencyProduct, Product>;
  };

  static initModel(sequelize: Sequelize): typeof AgencyProduct {
    AgencyProduct.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'agencies',
          key: 'id'
        }
      },
      product_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        }
      },
      current_stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0
        }
      },
      state: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    }, {
      sequelize,
      tableName: 'agencies_products',
      timestamps: false,
      indexes: [
        {
          fields: ['agency_id', 'product_id'],
          unique: true
        },
        {
          fields: ['product_id']
        }
      ]
    });

    return AgencyProduct;
  }

  static associate(models: {
    Agency: typeof Agency;
    Product: typeof Product;
  }) {
    if (!models.Agency || !models.Product) {
      throw new Error('Required models not provided to AgencyProduct.associate');
    }

    AgencyProduct.belongsTo(models.Agency, {
      foreignKey: 'agency_id',
      as: 'agency'
    });
    
    AgencyProduct.belongsTo(models.Product, {
      foreignKey: 'product_id',
      as: 'product'
    });
  }
}