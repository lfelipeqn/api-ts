import { 
    Model, 
    DataTypes, 
    Sequelize, 
    Association,
    HasManyGetAssociationsMixin,
    BelongsToGetAssociationMixin,
    Transaction,
    Op
  } from 'sequelize';
  import { User } from './User';
  import { CartDetail } from './CartDetail';
  import { Product } from './Product';
  import { PriceHistory } from './PriceHistory';
  import { 
    CartAttributes, 
    CartCreationAttributes,
    CartStatus,
    CART_STATUSES,
    CartSummary
  } from '../types/cart';
  
  export class Cart extends Model<CartAttributes, CartCreationAttributes> {
    declare id: number;
    declare user_id: number | null;
    declare session_id: string;
    declare status: CartStatus;
    declare expires_at: Date;
    declare created_at: Date;
    declare updated_at: Date;
  
    // Associations
    declare readonly user?: User;
    declare readonly details?: CartDetail[];
  
    // Association methods
    declare getUser: BelongsToGetAssociationMixin<User>;
    declare getDetails: HasManyGetAssociationsMixin<CartDetail>;
  
    public static associations: {
      user: Association<Cart, User>;
      details: Association<Cart, CartDetail>;
    };
  
    static initModel(sequelize: Sequelize): typeof Cart {
      Cart.init({
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        user_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
        },
        session_id: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM(...CART_STATUSES),
          allowNull: false,
          defaultValue: 'active',
        },
        expires_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        created_at: DataTypes.DATE,
        updated_at: DataTypes.DATE
      }, {
        sequelize,
        tableName: 'carts',
        timestamps: true,
        underscored: true,
        indexes: [
          {
            fields: ['session_id']
          },
          {
            fields: ['user_id']
          },
          {
            fields: ['status']
          }
        ]
      });
  
      return Cart;
    }
  
    static associate(models: any) {
      Cart.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      Cart.hasMany(models.CartDetail, { 
        foreignKey: 'cart_id', 
        as: 'details',
        onDelete: 'CASCADE'
      });
    }

    static async getActiveCart(userId: number): Promise<Cart | null> {
      return Cart.findOne({
        where: {
          user_id: userId,
          status: 'active'
        }
      });
    }

    static async getActiveGuestCart(sessionId: string): Promise<Cart | null> {
      return Cart.findOne({
        where: {
          session_id: sessionId,
          status: 'active',
          user_id: null
        }
      });
    }

    // Helper method to create cart data
    private static createCartData(
        sessionId: string,
        userId?: number
      ): CartCreationAttributes {
        return {
          session_id: sessionId,
          user_id: userId || null,
          status: 'active',
          expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
        };
      }
  
      async assignToUser(userId: number, transaction?: Transaction): Promise<void> {
        const t = transaction || await this.sequelize!.transaction();
        
        try {
          // Check if user already has an active cart
          const existingCart = await Cart.findOne({
            where: {
              user_id: userId,
              status: 'active'
            },
            transaction: t
          });
      
          if (existingCart && existingCart.id !== this.id) {
            // Merge this cart's items into the existing cart
            const details = await this.getDetails({ transaction: t });
            for (const detail of details) {
              await CartDetail.addToCart(
                existingCart.id,
                detail.product_id,
                detail.quantity,
                t
              );
            }
      
            // Mark this cart as converted
            await this.update({
              status: 'ordered'
            }, { transaction: t });
          } else {
            // Assign this cart to the user
            await this.update({
              user_id: userId,
              expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
            }, { transaction: t });
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
      

    static async getOrCreateUserCart(userId: number): Promise<Cart> {
      const cart = await Cart.findOne({
        where: {
          user_id: userId,
          status: 'active'
        }
      });
  
      if (cart) {
        return cart;
      }
  
      return Cart.create({
        user_id: userId,
        session_id: `user-${userId}-${Date.now()}`,
        status: 'active',
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
      });
    }
  
    async getSummary(): Promise<CartSummary> {
      console.log('Getting summary for cart:', this.id);
    
      const details = await CartDetail.findAll({
        where: { cart_id: this.id },
        include: [{
          model: Product,
          as: 'product'
        }, {
          model: PriceHistory,
          as: 'priceHistory'
        }],
        logging: console.log
      });
    
      console.log('Found details:', details.length);
    
      const summary: CartSummary = {
        total: 0,
        subtotal: 0,
        totalDiscount: 0,
        items: []
      };
    
      for (const detail of details) {
        const itemSummary = await detail.getItemSummary();
        console.log('Item summary:', itemSummary);
        summary.subtotal += itemSummary.subtotal;
        summary.totalDiscount += itemSummary.discount;
        summary.total += itemSummary.final_price;
        summary.items.push(itemSummary);
      }
    
      console.log('Final summary:', summary);
      return summary;
    }
    
  
    // Validate stock availability for all items
    async validateStock(): Promise<{
        valid: boolean;
        invalidItems: Array<{
          product_id: number;
          requested: number;
          available: number;
        }>;
      }> {
        const details = await this.getDetails({
          include: ['product']
        });
    
        const invalidItems:any[] = [];
    
        for (const detail of details) {
          const stockAvailable = await detail.validateStock();
          if (!stockAvailable.valid) {
            invalidItems.push(stockAvailable.data);
          }
        }
    
        return {
          valid: invalidItems.length === 0,
          invalidItems
        };
      }
    
      // Create a new cart for a session
      static async createForSession(
        sessionId: string,
        userId?: number
      ): Promise<Cart> {
        const cartData: CartCreationAttributes = {
          session_id: sessionId,
          user_id: userId || null,
          status: 'active',
          expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
        };
    
        return Cart.create(cartData);
      }
    
      // Find or create cart for a session
      static async findOrCreateForSession(
        sessionId: string,
        userId?: number
      ): Promise<Cart> {
        const [cart] = await Cart.findOrCreate({
          where: {
            session_id: sessionId,
            status: 'active'
          },
          defaults: {
            session_id: sessionId, // Add the required session_id field
            user_id: userId || null,
            status: 'active',
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          }
        });
    
        return cart;
      }

      async removeProduct(productId: number, transaction?: Transaction): Promise<void> {
        const t = transaction || await this.sequelize!.transaction();
        try {
          const detail = await CartDetail.findOne({
            where: {
              cart_id: this.id,
              product_id: productId
            },
            transaction: t
          });
    
          if (!detail) {
            throw new Error('Product not found in cart');
          }
    
          await detail.destroy({ transaction: t });
    
          if (!transaction) await t.commit();
        } catch (error) {
          if (!transaction) await t.rollback();
          throw error;
        }
      }

      static async cleanupAndCreateNew(userId: number | null, sessionId: string): Promise<Cart> {
        const t = await this.sequelize!.transaction();
        
        try {
          // Mark old active carts as abandoned
          await this.update({
            status: 'abandoned' as CartStatus
          }, {
            where: {
              [Op.or]: [
                { session_id: sessionId },
                ...(userId ? [{ user_id: userId }] : [])
              ],
              status: 'active'
            },
            transaction: t
          });
    
          // Create new cart
          const cart = await this.create({
            user_id: userId,
            session_id: sessionId,
            status: 'active' as CartStatus,
            expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
          }, { transaction: t });
    
          await t.commit();
          return cart;
        } catch (error) {
          await t.rollback();
          throw error;
        }
      }
  }