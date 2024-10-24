import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Client } from './Client';
import { ContactHistory } from './ContactHistory';

export class ClientStatusHistory extends Model {
  public id!: number;
  public old_state!: string;
  public new_state!: string;
  public data_origin!: string;
  public client_id!: number;
  public contact_history_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly client?: Client;
  public readonly contactHistory?: ContactHistory;

  public static associations: {
    client: Association<ClientStatusHistory, Client>;
    contactHistory: Association<ClientStatusHistory, ContactHistory>;
  };

  static initModel(sequelize: Sequelize): typeof ClientStatusHistory {
    ClientStatusHistory.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      old_state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      new_state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      data_origin: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      contact_history_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'client_status_histories',
      timestamps: true,
      underscored: true,
    });

    return ClientStatusHistory;
  }

  static associate(models: any) {
    ClientStatusHistory.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    ClientStatusHistory.belongsTo(models.ContactHistory, { foreignKey: 'contact_history_id', as: 'contactHistory' });
  }

  // You can add query factory methods here
  static async findByClient(clientId: number): Promise<ClientStatusHistory[]> {
    return this.findAll({
      where: { client_id: clientId },
      order: [['created_at', 'DESC']],
    });
  }

  // You can add static methods here
  static async createStatusChange(clientId: number, oldState: string, newState: string, dataOrigin: string, contactHistoryId?: number): Promise<ClientStatusHistory> {
    return this.create({
      client_id: clientId,
      old_state: oldState,
      new_state: newState,
      data_origin: dataOrigin,
      contact_history_id: contactHistoryId,
    });
  }

  // You can add instance methods here if needed
}