import { 
    Model, 
    DataTypes, 
    Sequelize, 
    Association,
    HasManyGetAssociationsMixin,
    BelongsToGetAssociationMixin,
    Transaction
  } from 'sequelize';
  import { User } from './User';
  import { CartDetail } from './CartDetail';
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
      await this.update({ 
        user_id: userId,
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days
      }, { transaction });
    }
  
    async getSummary(): Promise<CartSummary> {
      const details = await this.getDetails({
        include: [
          {
            association: 'product',
            include: ['currentPrice', 'activePromotions']
          }
        ]
      });
  
      const summary: CartSummary = {
        total: 0,
        subtotal: 0,
        totalDiscount: 0,
        items: []
      };
  
      for (const detail of details) {
        const itemSummary = await detail.getItemSummary();
        summary.subtotal += itemSummary.subtotal;
        summary.totalDiscount += itemSummary.discount;
        summary.total += itemSummary.final_price;
        summary.items.push(itemSummary);
      }
  
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
    
        const invalidItems = [];
    
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
  }