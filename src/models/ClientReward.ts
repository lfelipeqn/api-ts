import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Client } from './Client';
import { ClientRewardSetting } from './ClientRewardSetting';
import { Vehicle } from './Vehicle';
import { MileageHistory } from './MileageHistory';
import { Order } from './Order';
import { PointConfiguration } from './PointConfiguration';
import { ClientRewardRedemption } from './ClientRewardRedemption';
import moment from 'moment';

export class ClientReward extends Model {
  public id!: number;
  public state!: string;
  public expiration_date!: Date | null;
  public deadline!: Date | null;
  public aux_reward_value!: number | null;
  public client_id!: number;
  public client_rewards_setting_id!: number;
  public vehicle_id!: number | null;
  public mileage_history_id!: number | null;
  public order_id!: number | null;
  public point_configuration_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly client?: Client;
  public readonly clientRewardSetting?: ClientRewardSetting;
  public readonly vehicle?: Vehicle;
  public readonly mileageHistory?: MileageHistory;
  public readonly order?: Order;
  public readonly pointConfiguration?: PointConfiguration;
  public readonly clientRewardsRedemptions?: ClientRewardRedemption[];

  public static associations: {
    client: Association<ClientReward, Client>;
    clientRewardSetting: Association<ClientReward, ClientRewardSetting>;
    vehicle: Association<ClientReward, Vehicle>;
    mileageHistory: Association<ClientReward, MileageHistory>;
    order: Association<ClientReward, Order>;
    pointConfiguration: Association<ClientReward, PointConfiguration>;
    clientRewardsRedemptions: Association<ClientReward, ClientRewardRedemption>;
  };

  static initModel(sequelize: Sequelize): typeof ClientReward {
    ClientReward.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      expiration_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deadline: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      aux_reward_value: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      client_rewards_setting_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      vehicle_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      mileage_history_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      order_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      point_configuration_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'client_rewards',
      timestamps: true,
      underscored: true,
    });

    return ClientReward;
  }

  static associate(models: any) {
    ClientReward.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    ClientReward.belongsTo(models.ClientRewardSetting, { foreignKey: 'client_rewards_setting_id', as: 'clientRewardSetting' });
    ClientReward.belongsTo(models.Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
    ClientReward.belongsTo(models.MileageHistory, { foreignKey: 'mileage_history_id', as: 'mileageHistory' });
    ClientReward.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    ClientReward.belongsTo(models.PointConfiguration, { foreignKey: 'point_configuration_id', as: 'pointConfiguration' });
    ClientReward.hasMany(models.ClientRewardRedemption, { foreignKey: 'client_reward_id', as: 'clientRewardsRedemptions' });
  }

  async claim(vehicle?: Vehicle): Promise<boolean> {
    if (!this.clientRewardSetting) {
      await this.reload({ include: ['clientRewardSetting'] });
    }

    const update: any = {
      state: 'R' // Reclamada
    };

    if (this.clientRewardSetting!.duration) {
      update.expiration_date = moment().add(this.clientRewardSetting!.duration, 'days').endOf('day').toDate();
    }

    if (this.clientRewardSetting!.reason === 'RV') {
      if (vehicle) {
        update.vehicle_id = vehicle.id;
      } else {
        return false;
      }
    }

    if (this.clientRewardSetting!.reason === 'KM') {
      if (vehicle) {
        const lastMileageHistory = await vehicle.lastMileageHistory();
        if (lastMileageHistory && !(await ClientReward.findOne({ where: { mileage_history_id: lastMileageHistory.id } }))) {
          update.mileage_history_id = lastMileageHistory.id;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }

    await this.update(update);
    return true;
  }

  async redeem(order: Order, vehicleId: number | null, value: number): Promise<void> {
    if (this.state === 'R' && this.client_id === order.client_id && await this.value(true) >= value) {
      if (!this.clientRewardSetting) {
        await this.reload({ include: ['clientRewardSetting'] });
      }

      await ClientRewardRedemption.create({
        redeemed_value: value,
        client_reward_id: this.id,
        order_id: order.id,
        point_configuration_id: this.clientRewardSetting!.type === 'P' ? (await PointConfiguration.current()).id : null
      });

      if (this.clientRewardSetting!.product_id && (this.clientRewardSetting!.type === 'S' || this.clientRewardSetting!.type === 'PR')) {
        await order.assignElements([
          { element_id: this.clientRewardSetting!.product_id, amount: 1 }
        ], vehicleId, true);
      }

      if (await this.value(true) === 0) {
        await this.update({ state: 'RD' });
      }
    }
  }

  async value(available: boolean = false): Promise<number> {
    if (!this.clientRewardSetting) {
      await this.reload({ include: ['clientRewardSetting'] });
    }

    const total = this.clientRewardSetting!.value || this.aux_reward_value || 0;

    if (available) {
      const redeemedValue = await ClientRewardRedemption.sum('redeemed_value', { where: { client_reward_id: this.id } });
      return total - redeemedValue;
    }

    return total;
  }

  isDisabled(): boolean {
    const now = moment();
    return (
      (this.state === 'R' && this.expiration_date && now.isAfter(this.expiration_date)) ||
      (this.state === 'D' && this.deadline && now.isAfter(this.deadline)) ||
      ['ND', 'RD', 'V'].includes(this.state)
    );
  }
}