import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { User } from './User';
import { Client } from './Client';
import { ClientStatusHistory } from './ClientStatusHistory';

export class ContactHistory extends Model {
  public id!: number;
  public message!: string;
  public user_id!: number;
  public client_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly user?: User;
  public readonly client?: Client;
  public readonly clientStatusHistory?: ClientStatusHistory;

  public static associations: {
    user: Association<ContactHistory, User>;
    client: Association<ContactHistory, Client>;
    clientStatusHistory: Association<ContactHistory, ClientStatusHistory>;
  };

  static initModel(sequelize: Sequelize): typeof ContactHistory {
    ContactHistory.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'contact_histories',
      timestamps: true,
      underscored: true,
    });

    return ContactHistory;
  }

  static associate(models: any) {
    ContactHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    ContactHistory.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    ContactHistory.hasOne(models.ClientStatusHistory, { foreignKey: 'contact_history_id', as: 'clientStatusHistory' });
  }

  async updateFull(message: string, state: string): Promise<void> {
    await this.update({ message });

    const client = await this.$get('client');
    if (!client) {
      throw new Error('Client not found');
    }

    const clientStatusHistory = await this.$get('clientStatusHistory');
    if (!clientStatusHistory) {
      throw new Error('ClientStatusHistory not found');
    }

    // Check if the current client state allows the change to the sent state
    const allowedState = await client.allowStateChange(state, "users");
    if (allowedState === state) {
      // If a different state than the current client state is sent
      if (state && state !== client.state) {
        // Update the state in the status change history
        await clientStatusHistory.update({ new_state: state });
        // Update the current state of the client
        await client.update({ state });
      }
    }
  }

  // You can add query factory methods here
  static async findByClient(clientId: number): Promise<ContactHistory[]> {
    return this.findAll({
      where: { client_id: clientId },
      include: ['user', 'clientStatusHistory'],
      order: [['created_at', 'DESC']]
    });
  }

  // You can add more methods here if needed
}