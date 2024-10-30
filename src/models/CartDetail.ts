import { 
    Model, 
    DataTypes, 
    Sequelize, 
    Association,
    BelongsToGetAssociationMixin,
    Transaction,
    DestroyOptions as SequelizeDestroyOptions,
  } from 'sequelize';
  import { Cart } from './Cart';
  import { Product } from './Product';
  import { PriceHistory } from './PriceHistory';
  import { Promotion } from './Promotion';
  import { 
    CartDetailAttributes, 
    CartDetailCreationAttributes,
    CartSummaryItem,
    AppliedPromotion,
    CartStatus
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
      const t = transaction || await this.sequelize!.transaction();
      
      try {
        if (quantity < 1) {
          await this.destroy({ transaction: t });
          
          // Check if cart should be marked as abandoned
          const remainingDetails = await CartDetail.count({
            where: { cart_id: this.cart_id },
            transaction: t
          });
  
          if (remainingDetails === 0) {
            await Cart.update(
              { status: 'abandoned' as CartStatus },
              { 
                where: { id: this.cart_id },
                transaction: t
              }
            );
          }
        } else {
          await this.update({ quantity }, { transaction: t });
        }
  
        if (!transaction) {
          await t.commit();
        }
      } catch (error) {
        if (!transaction) {
          await t.rollback();
        }
        throw error;
      }
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
      const product = await this.getProduct();
      const priceHistory = await PriceHistory.findByPk(this.price_history_id);
    
      if (!product || !priceHistory) {
        throw new Error(`Required data not found for cart detail ${this.id}`);
      }
    
      const currentPrice = await product.getCurrentPrice();
    
      // Get all active promotions for the product
      const activePromotions = await Promotion.findAll({
        attributes: [
          'id',
          'discount',
          'type',
          'start_date',
          'end_date'
        ],
        where: {
          state: 'ACTIVE'
        },
        include: [{
          model: Product,
          as: 'products',
          where: { id: this.product_id },
          attributes: [],
          through: {
            attributes: []
          }
        }],
        order: [
          ['start_date', 'DESC'],
          ['discount', 'DESC']
        ]
      });
    
      // Function to check if a promotion is currently valid
      const isPromotionValid = (promotion: any): boolean => {
        const now = new Date();
        // If start_date and end_date are null, it's a permanent promotion
        if (!promotion.start_date && !promotion.end_date) {
          return true;
        }
        // If dates exist, check if current date is within range
        if (promotion.start_date && promotion.end_date) {
          return now >= promotion.start_date && now <= promotion.end_date;
        }
        return false;
      };
    
      // First, check for valid sporadic promotions (with dates)
      let applicablePromotion = activePromotions.find(
        promo => promo.start_date && promo.end_date && isPromotionValid(promo)
      );
    
      // If no valid sporadic promotion, check for permanent promotions
      if (!applicablePromotion) {
        applicablePromotion = activePromotions.find(
          promo => !promo.start_date && !promo.end_date
        );
      }
    
      // Calculate discount if a promotion is found
      let discount = 0;
      if (applicablePromotion) {
        discount = applicablePromotion.calculateDiscountAmount(currentPrice);
      }
    
      const subtotal = currentPrice * this.quantity;
      const totalDiscount = discount * this.quantity;
    
      const stockValidation = await this.validateStock();
    
      // Create the applied promotion object if there is one
      let appliedPromotion: AppliedPromotion | null = null;
      if (applicablePromotion) {
        appliedPromotion = {
          id: applicablePromotion.id,
          type: applicablePromotion.type,
          discount: applicablePromotion.discount,
          is_sporadic: !!(applicablePromotion.start_date && applicablePromotion.end_date)
        };
      }
    
      return {
        product_id: this.product_id,
        quantity: this.quantity,
        price: currentPrice,
        discount: totalDiscount,
        subtotal,
        final_price: subtotal - totalDiscount,
        stock_available: stockValidation.valid,
        applied_promotion: appliedPromotion
      };
    }
    
    static async addToCart(
      cartId: number,
      productId: number,
      quantity: number,
      transaction?: Transaction
    ): Promise<CartDetail> {
      const sequelize = this.sequelize!;
      const t = transaction || await sequelize.transaction();
  
      try {
        const latestPrice = await PriceHistory.findOne({
          where: { product_id: productId },
          order: [['created_at', 'DESC']]
        });
  
        if (!latestPrice) {
          if (!transaction) await t.rollback();
          throw new Error(`No price history found for product ${productId}`);
        }
  
        let detail = await CartDetail.findOne({
          where: {
            cart_id: cartId,
            product_id: productId
          },
          transaction: t
        });
  
        if (detail) {
          await detail.update({
            quantity: detail.quantity + quantity
          }, { transaction: t });
        } else {
          detail = await CartDetail.create({
            cart_id: cartId,
            product_id: productId,
            quantity,
            price_history_id: latestPrice.id
          }, { transaction: t });
        }
  
        if (!transaction) await t.commit();
        return detail;
      } catch (error) {
        if (!transaction) await t.rollback();
        throw error;
      }
    }

    private static async updateCartStatus(cartId: number, transaction?: Transaction): Promise<void> {
      const details = await CartDetail.count({
        where: { cart_id: cartId },
        transaction
      });
  
      if (details === 0) {
        await Cart.update(
          { status: 'abandoned' as CartStatus },
          { 
            where: { id: cartId },
            transaction
          }
        );
      }
    }

    async destroy(options?: Omit<SequelizeDestroyOptions, 'where'>): Promise<void> {
      const t = options?.transaction || await this.sequelize.transaction();
      try {
        await super.destroy({ ...options, transaction: t });
        await CartDetail.updateCartStatus(this.cart_id, t);
        
        if (!options?.transaction) await t.commit();
      } catch (error) {
        if (!options?.transaction) await t.rollback();
        throw error;
      }
    }

  }