import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { ClientReward } from './ClientReward';
import { Order } from './Order';
import { PointConfiguration } from './PointConfiguration';

export class ClientRewardRedemption extends Model {
  public id!: number;
  public redeemed_value!: number;
  public client_reward_id!: number;
  public order_id!: number;
  public point_configuration_id!: number | null;

  // Associations
  public readonly clientReward?: ClientReward;
  public readonly order?: Order;
  public readonly pointConfiguration?: PointConfiguration;

  public static associations: {
    clientReward: Association<ClientRewardRedemption, ClientReward>;
    order: Association<ClientRewardRedemption, Order>;
    pointConfiguration: Association<ClientRewardRedemption, PointConfiguration>;
  };

  static initModel(sequelize: Sequelize): typeof ClientRewardRedemption {
    ClientRewardRedemption.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      redeemed_value: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      client_reward_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      point_configuration_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'client_rewards_redemptions',
      timestamps: false,
    });

    return ClientRewardRedemption;
  }

  static associate(models: any) {
    ClientRewardRedemption.belongsTo(models.ClientReward, { foreignKey: 'client_reward_id', as: 'clientReward' });
    ClientRewardRedemption.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    ClientRewardRedemption.belongsTo(models.PointConfiguration, { foreignKey: 'point_configuration_id', as: 'pointConfiguration' });
  }

  // You can add query factory methods here
  static async findByClientReward(clientRewardId: number): Promise<ClientRewardRedemption[]> {
    return this.findAll({
      where: { client_reward_id: clientRewardId },
      include: ['order', 'pointConfiguration']
    });
  }

  // You can add more methods here if needed
}