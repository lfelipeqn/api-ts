import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Product } from './Product';
import { Agency } from './Agency';
// import { User } from './User';  // Commented out User import

interface StockHistoryAttributes {
    id: number;
    quantity: number;
    previous_stock: number;
    current_stock: number;
    type: 'IN' | 'OUT' | 'ADJUST';
    reference?: string;
    product_id: number;
    agency_id: number;
    user_id: number;
    created_at: Date;
    updated_at: Date;
  }
  
  interface StockHistoryCreationAttributes
    extends Omit<StockHistoryAttributes, 'id' | 'created_at' | 'updated_at'> {}
  
  export class StockHistory extends Model<StockHistoryAttributes, StockHistoryCreationAttributes> {
    public id!: number;
    public quantity!: number;
    public previous_stock!: number;
    public current_stock!: number;
    public type!: 'IN' | 'OUT' | 'ADJUST';
    public reference?: string;
    public product_id!: number;
    public agency_id!: number;
    public user_id!: number;
  
    // Timestamps
    public readonly created_at!: Date;
    public readonly updated_at!: Date;

    public readonly product?: Product;
    public readonly agency?: Agency;

    public static associations: {
      product: Association<StockHistory, Product>;
      agency: Association<StockHistory, Agency>;
    };
  
    static initModel(sequelize: Sequelize): typeof StockHistory {
      StockHistory.init({
          id: {
              type: DataTypes.INTEGER.UNSIGNED,
              autoIncrement: true,
              primaryKey: true,
          },
          quantity: {
              type: DataTypes.INTEGER,
              allowNull: false,
          },
          previous_stock: {
              type: DataTypes.INTEGER,
              allowNull: false,
          },
          current_stock: {
              type: DataTypes.INTEGER,
              allowNull: false,
          },
          type: {
              type: DataTypes.ENUM('IN', 'OUT', 'ADJUST'),
              allowNull: false,
          },
          reference: {
              type: DataTypes.STRING,
              allowNull: true,
          },
          product_id: {
              type: DataTypes.INTEGER.UNSIGNED,
              allowNull: false,
          },
          agency_id: {
              type: DataTypes.INTEGER.UNSIGNED,
              allowNull: false,
          },
          user_id: {
              type: DataTypes.INTEGER.UNSIGNED,
              allowNull: false,
              defaultValue: 1,
          },
          created_at: '',
          updated_at: ''
      }, {
        sequelize,
        tableName: 'stock_histories',
        timestamps: true,
        underscored: true,
        indexes: [
          {
            fields: ['product_id', 'agency_id']
          },
          {
            fields: ['agency_id']
          },
          {
            fields: ['type']
          },
          {
            fields: ['created_at']
          }
        ]
      });
  
      return StockHistory;
    }
  
    static associate(models:{
      Product: typeof Product;
      Agency: typeof Agency;}) {
      if (!models.Product || !models.Agency) {
        throw new Error(`Required models not provided to StockHistory.associate. 
          Available models: ${Object.keys(models).join(', ')}`);
      }
    
      StockHistory.belongsTo(models.Product, {
        foreignKey: 'product_id',
        as: 'product'
      });
    
      StockHistory.belongsTo(models.Agency, {
        foreignKey: 'agency_id',
        as: 'agency'
      });

      //StockHistory.belongsTo(models.User, { 
      //  foreignKey: 'user_id', 
      //  as: 'user' 
      //});
    }

    
  }
  