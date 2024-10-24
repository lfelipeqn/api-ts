import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Product } from './Product';
import { Order } from './Order';
import { ClientReward } from './ClientReward';

export class ClientRewardSetting extends Model {
  public id!: number;
  public state!: number;
  public type!: string;
  public reason!: string;
  public value!: number;
  public duration!: number | null;
  public duration_deadline!: number | null;
  public applies_to_products!: string | null;
  public applies_to_services!: string | null;
  public instant!: boolean;
  public applies_to_each_element!: boolean;
  public product_line_id!: number | null;
  public service_line_id!: number | null;
  public product_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly products?: Product[];

  public static associations: {
    products: Association<ClientRewardSetting, Product>;
  };

  static initModel(sequelize: Sequelize): typeof ClientRewardSetting {
    ClientRewardSetting.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      value: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      duration_deadline: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      applies_to_products: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      applies_to_services: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      instant: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      applies_to_each_element: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      service_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      product_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'client_rewards_settings',
      timestamps: true,
      underscored: true,
    });

    return ClientRewardSetting;
  }

  static associate(models: any) {
    ClientRewardSetting.belongsToMany(models.Product, { 
      through: 'client_rewards_settings_products',
      foreignKey: 'client_reward_setting_id',
      otherKey: 'product_id',
      as: 'products'
    });
  }

  async appliesToElement(element: Product): Promise<boolean> {
    let apply = false;

    if (this.type === 'P' && !this.applies_to_products && !this.applies_to_services) {
      apply = true;
    } else {
      if (element.is_product === true) {
        switch (this.applies_to_products) {
          case 'TP':
            apply = true;
            break;
          case 'PL':
            apply = this.product_line_id === element.product_line_id;
            break;
          case 'PS':
            const product = await this.$get('products', { where: { id: element.id } });
            apply = product.length > 0;
            break;
        }
      } else {
        switch (this.applies_to_services) {
          case 'TS':
            apply = true;
            break;
          case 'SL':
            apply = this.service_line_id === element.product_line_id;
            break;
          case 'SS':
            const product = await this.$get('products', { where: { id: element.id } });
            apply = product.length > 0;
            break;
        }
      }
    }

    return apply;
  }

  async redeem(order: Order, vehicleId: number | null = null): Promise<void> {
    if (this.instant && this.state === 1) {
      const clientReward = await ClientReward.create({
        state: 'R',
        client_id: order.client_id,
        client_rewards_setting_id: this.id
      });

      const value = await clientReward.value(true);
      await clientReward.redeem(order, vehicleId, value);
    }
  }

  // You can add query factory methods here
  static async findActive(): Promise<ClientRewardSetting[]> {
    return this.findAll({
      where: { state: 1 }
    });
  }

  // You can add more static methods here if needed
}