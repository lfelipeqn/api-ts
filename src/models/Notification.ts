import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { User } from './User';
import { FCMToken } from './FCMToken';
import * as admin from 'firebase-admin';

export class Notification extends Model {
  public id!: number;
  public date!: Date;
  public name!: string;
  public title!: string;
  public message!: string;
  public extra!: string | null;
  public url!: string | null;
  public is_external_url!: boolean;
  public variant!: string | null;
  public pusher_send!: boolean;
  public foreign_key_table!: string | null;
  public foreign_key_id!: number | null;
  public foreign_key_value!: string | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly users?: User[];

  public static associations: {
    users: Association<Notification, User>;
  };

  static initModel(sequelize: Sequelize): typeof Notification {
    Notification.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      extra: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_external_url: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      variant: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pusher_send: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      foreign_key_table: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      foreign_key_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      foreign_key_value: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'notifications',
      timestamps: true,
      underscored: true,
    });

    return Notification;
  }

  static associate(models: any) {
    Notification.belongsToMany(models.User, { 
      through: 'user_notifications',
      foreignKey: 'notification_id',
      otherKey: 'user_id',
      as: 'users'
    });
  }

  async send(userId: number | null = null, updatePivot: boolean = true): Promise<void> {
    const sendNotification = async (user: User) => {
      const tokens = await FCMToken.findAll({ where: { person_id: user.person_id } });
      
      if (tokens.length > 0) {
        for (const token of tokens) {
          const message = {
            notification: {
              title: this.title,
              body: this.message,
            },
            token: token.token,
          };

          try {
            await admin.messaging().send(message);
            if (updatePivot) {
              await this.$set('users', [user], { through: { send: '1' } });
            }
          } catch (error) {
            console.error('Error sending notification:', error);
          }
        }
      }
    };

    if (userId) {
      const user = await User.findByPk(userId);
      if (user) {
        await sendNotification(user);
      }
    } else {
      const users = await this.$get('users');
      for (const user of users) {
        await sendNotification(user);
      }
    }
  }

  // You can add query factory methods here
  static async findRecentNotifications(limit: number = 10): Promise<Notification[]> {
    return this.findAll({
      order: [['date', 'DESC']],
      limit
    });
  }

  // You can add more methods here if needed
}