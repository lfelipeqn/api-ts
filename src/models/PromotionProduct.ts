import { Model, DataTypes, Sequelize } from 'sequelize';

interface PromotionProductAttributes {
  id: number;
  promotion_id: number;
  product_id: number;
}

export class PromotionProducts extends Model<PromotionProductAttributes> {
  declare id: number;
  declare promotion_id: number;
  declare product_id: number;

  static initModel(sequelize: Sequelize): typeof PromotionProducts {
    PromotionProducts.init({
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      promotion_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'promotions',
          key: 'id'
        }
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        }
      }
    }, {
      sequelize,
      tableName: 'promotions_products',
      timestamps: false,
      underscored: true
    });

    return PromotionProducts;
  }
}