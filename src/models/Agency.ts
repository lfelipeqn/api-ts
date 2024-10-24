import { 
  Model, 
  DataTypes, 
  Sequelize, 
  Association,
  BelongsToManyGetAssociationsMixin,
  BelongsToGetAssociationMixin,
  FindOptions,
  Op
} from 'sequelize';
import { Address } from './Address';
import { Product } from './Product';
//import { Order } from './Order';
//import { ComplementaryAgency } from './ComplementaryAgency';
//import { PriceHistory } from './PriceHistory';
//import { AgencyProduct } from './AgencyProduct';

interface AgencyAttributes {
  id: number;
  magister_cellar: string;
  document_prefix: string;
  number: string;
  cell_phone_number: string;
  business_hours: string;
  state: string;
  address_id: number;
  created_at: Date;
  updated_at: Date;
}

export class Agency extends Model<AgencyAttributes> {
  public id!: number;
  public magister_cellar!: string;
  public document_prefix!: string;
  public number!: string;
  public cell_phone_number!: string;
  public business_hours!: string;
  public state!: string;
  public address_id!: number;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly address?: Address;
  public readonly products?: Product[];

  // Association methods
  public getAddress!: BelongsToGetAssociationMixin<Address>;
  public getProducts!: BelongsToManyGetAssociationsMixin<Product>;

  public static associations: {
    address: Association<Agency, Address>;
    products: Association<Agency, Product>;
  };

  static initModel(sequelize: Sequelize): typeof Agency {
    Agency.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      magister_cellar: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      document_prefix: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      cell_phone_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      business_hours: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      created_at: '',
      updated_at: ''
    }, {
      sequelize,
      tableName: 'agencies',
      timestamps: true,
      underscored: true,
    });

    return Agency;
  }

  static associate(models: {
    Address: typeof Address;
    Product: typeof Product;
  }) {
    Agency.belongsTo(models.Address, { 
      foreignKey: 'address_id', 
      as: 'address' 
    });

    Agency.belongsToMany(models.Product, {
      through: 'agencies_products',
      foreignKey: 'agency_id',
      otherKey: 'product_id',
      as: 'products'
    });
  }

  async getProductStock(product_id: number): Promise<number> {
    try {
      const sequelize = this.sequelize!;
      const [result] = await sequelize.query(`
        SELECT current_stock
        FROM agencies_products
        WHERE agency_id = :agencyId
        AND product_id = :productId
        AND state = true
      `, {
        replacements: {
          agencyId: this.id,
          productId: product_id
        },
        type: 'SELECT'
      });

      return result ? (result as any).current_stock : 0;
    } catch (error) {
      console.error('Error getting product stock:', error);
      return 0;
    }
  }


  /** Function to enable with Order Model Actvation
    async committedStock(product_id: number): Promise<number> {
      try {
        // Use raw query instead of complex include
        const sequelize = this.sequelize!;
        const [results] = await sequelize.query(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM complementary_agencies ca
          JOIN price_histories ph ON ph.id = ca.price_history_id
          WHERE ca.agency_id = :agencyId
          AND ph.product_id = :productId
          AND ca.magister_stock_sync_status = 0
        `, {
          replacements: {
            agencyId: this.id,
            productId: product_id
          },
          type: 'SELECT'
        });

        return results ? (results as any).total : 0;
      } catch (error) {
        console.error('Error getting committed stock:', error);
        return 0;
      }
    }
    async committableStock(product_id: number): Promise<number> {
      const currentStock = await this.getProductStock(product_id);
      const committedStock = await this.committedStock(product_id);
      return currentStock - committedStock;
    }

    async canDispatchOrder(order: Order): Promise<boolean> {
      try {
        const priceHistories = await order.getPriceHistories();
        
        for (const priceHistory of priceHistories) {
          const product = await priceHistory.getProduct();
          const amount = await priceHistory.getAmount(); // Assuming you have this method

          if (!product.is_product) {
            // Check if product exists in agency
            const exists = await this.hasProduct(product.id);
            if (!exists) {
              return false;
            }
          } else {
            const committableStock = await this.committableStock(product.id);
            if (amount > committableStock) {
              return false;
            }
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error checking order dispatch capability:', error);
        return false;
      }
    }
  */

    async hasProduct(productId: number): Promise<boolean> {
      const count = await this.sequelize!.query(`
        SELECT COUNT(*) as count
        FROM agencies_products
        WHERE agency_id = :agencyId
        AND product_id = :productId
        AND state = true
      `, {
        replacements: {
          agencyId: this.id,
          productId
        },
        type: 'SELECT'
      });
  
      return (count[0] as any).count > 0;
    }

  // Get stock summary using raw queries for better performance
  async getStockSummary(): Promise<{
    totalProducts: number;
    totalStock: number;
    lowStockProducts: Array<{
      productId: number;
      currentStock: number;
    }>;
  }> {
    const sequelize = this.sequelize!;
    
    const [summary] = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT product_id) as totalProducts,
        COALESCE(SUM(current_stock), 0) as totalStock
      FROM agencies_products
      WHERE agency_id = :agencyId AND state = true
    `, {
      replacements: { agencyId: this.id },
      type: 'SELECT'
    });

    const [lowStock] = await sequelize.query(`
      SELECT product_id, current_stock
      FROM agencies_products
      WHERE agency_id = :agencyId 
      AND state = true
      AND current_stock < 10
    `, {
      replacements: { agencyId: this.id },
      type: 'SELECT'
    });

    return {
      totalProducts: (summary as any).totalProducts || 0,
      totalStock: (summary as any).totalStock || 0,
      lowStockProducts: lowStock as Array<{ productId: number; currentStock: number }>
    };
  }

}