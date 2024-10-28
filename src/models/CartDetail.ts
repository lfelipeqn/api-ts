import { 
    Model, 
    DataTypes, 
    Sequelize, 
    Association,
    BelongsToGetAssociationMixin,
    Transaction,
    Op
  } from 'sequelize';
  import { Cart } from './Cart';
  import { Product } from './Product';
  import { PriceHistory } from './PriceHistory';
  import { Promotion } from './Promotion';
  import { 
    CartDetailAttributes, 
    CartDetailCreationAttributes,
    CartSummaryItem
  } from '../types/cart';
  
  export class CartDetail extends Model<CartDetailAttributes, CartDetailCreationAttributes> {
    declare id: number;
    declare cart_id: number;
    declare product_id: number;
    declare quantity: number;
    declare price_history_id: number;
    declare created_at: Date;
    declare updated_at: Date;
  
    // Associations
    declare readonly cart?: Cart;
    declare readonly product?: Product;
    declare readonly priceHistory?: PriceHistory;
  
    // Association methods
    declare getCart: BelongsToGetAssociationMixin<Cart>;
    declare getProduct: BelongsToGetAssociationMixin<Product>;
    declare getPriceHistory: BelongsToGetAssociationMixin<PriceHistory>;
  
    public static associations: {
      cart: Association<CartDetail, Cart>;
      product: Association<CartDetail, Product>;
      priceHistory: Association<CartDetail, PriceHistory>;
    };
  
    static initModel(sequelize: Sequelize): typeof CartDetail {
      CartDetail.init({
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        cart_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        product_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
          validate: {
            min: 1
          }
        },
        price_history_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE,
      }, {
        sequelize,
        tableName: 'cart_details',
        timestamps: true,
        underscored: true,
        indexes: [
          {
            fields: ['cart_id']
          },
          {
            fields: ['product_id']
          },
          {
            unique: true,
            fields: ['cart_id', 'product_id']
          }
        ]
      });
  
      return CartDetail;
    }
  
    static associate(models: any) {
      CartDetail.belongsTo(models.Cart, { foreignKey: 'cart_id', as: 'cart' });
      CartDetail.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
      CartDetail.belongsTo(models.PriceHistory, { 
        foreignKey: 'price_history_id', 
        as: 'priceHistory' 
      });
    }
  
    async updateQuantity(
      quantity: number,
      transaction?: Transaction
    ): Promise<void> {
      if (quantity < 1) {
        await this.destroy({ transaction });
        return;
      }
  
      await this.update({ quantity }, { transaction });
    }
  
    async validateStock(): Promise<{
      valid: boolean;
      data: {
        product_id: number;
        requested: number;
        available: number;
      };
    }> {
      const product = await this.getProduct();
      const available = await product.getCurrentStock();
  
      return {
        valid: available >= this.quantity,
        data: {
          product_id: this.product_id,
          requested: this.quantity,
          available
        }
      };
    }
  
    async getItemSummary(): Promise<CartSummaryItem> {
      const [product, priceHistory] = await Promise.all([
        this.getProduct(),
        this.getPriceHistory()
      ]);
  
      // Get active promotions for the product
      const activePromotions = await Promotion.findAll({
        where: {
          state: 'ACTIVE',
          start_date: { [Op.lte]: new Date() },
          end_date: { [Op.gte]: new Date() }
        },
        include: [{
          model: Product,
          where: { id: this.product_id }
        }]
      });
  
      // Calculate maximum discount from active promotions
      let maxDiscount = 0;
      for (const promotion of activePromotions) {
        const discount = promotion.calculateDiscountAmount(priceHistory.price);
        maxDiscount = Math.max(maxDiscount, discount);
      }
  
      const subtotal = priceHistory.price * this.quantity;
      const totalDiscount = maxDiscount * this.quantity;
  
      const stockValidation = await this.validateStock();
  
      return {
        product_id: this.product_id,
        quantity: this.quantity,
        price: priceHistory.price,
        discount: totalDiscount,
        subtotal,
        final_price: subtotal - totalDiscount,
        stock_available: stockValidation.valid
      };
    }
  
    static async addToCart(
      cartId: number,
      productId: number,
      quantity: number,
      transaction?: Transaction
    ): Promise<CartDetail> {
      // Get latest price history
      const latestPrice = await PriceHistory.findOne({
        where: { product_id: productId },
        order: [['created_at', 'DESC']]
      });
  
      if (!latestPrice) {
        throw new Error('No price found for product');
      }
  
      const [detail] = await CartDetail.findOrCreate({
        where: {
          cart_id: cartId,
          product_id: productId
        },
        defaults: {
          cart_id: cartId,
          product_id: productId,
          quantity,
          price_history_id: latestPrice.id
        },
        transaction
      });
  
      // If detail existed, update quantity
      if (detail) {
        await detail.updateQuantity(detail.quantity + quantity, transaction);
      }
  
      return detail;
    }
  }