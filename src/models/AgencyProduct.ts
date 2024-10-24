import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Agency } from './Agency';
import { Product } from './Product';

interface AgencyProductAttributes {
  id: number;
  agency_id: number;
  product_id: number;
  current_stock: number;
  state: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AgencyProductCreationAttributes
  extends Omit<AgencyProductAttributes, 'id' | 'created_at' | 'updated_at'> {}

export class AgencyProduct extends Model<AgencyProductAttributes, AgencyProductCreationAttributes> {
  public id!: number;
  public agency_id!: number;
  public product_id!: number;
  public current_stock!: number;
  public state!: boolean;

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
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      }
    }, {
      sequelize,
      tableName: 'agencies_products',
      timestamps: true,
      underscored: true,
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