import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { Person } from './Person';

export class FCMToken extends Model {
  public id!: number;
  public token!: string;
  public person_id!: number;

  // Associations
  public readonly person?: Person;

  public static associations: {
    person: Association<FCMToken, Person>;
  };

  static initModel(sequelize: Sequelize): typeof FCMToken {
    FCMToken.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      person_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'fcm_tokens',
      timestamps: false,
    });

    return FCMToken;
  }

  static associate(models: any) {
    FCMToken.belongsTo(models.Person, { foreignKey: 'person_id', as: 'person' });
  }

  // You can add query factory methods here
  static async findByToken(token: string): Promise<FCMToken | null> {
    return this.findOne({ where: { token } });
  }

  static async findByPerson(personId: number): Promise<FCMToken[]> {
    return this.findAll({ where: { person_id: personId } });
  }

  // You can add more methods here if needed
}