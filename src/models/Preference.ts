import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { User } from './User';

export class Preference extends Model {
  public id!: number;
  public name!: string;
  public description!: string | null;

  // Associations
  public readonly users?: User[];

  public static associations: {
    users: Association<Preference, User>;
  };

  static initModel(sequelize: Sequelize): typeof Preference {
    Preference.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'preferences',
      timestamps: false,
    });

    return Preference;
  }

  static associate(models: any) {
    Preference.belongsToMany(models.User, { 
      through: 'user_preferences',
      foreignKey: 'preference_id',
      otherKey: 'user_id',
      as: 'users'
    });
  }

  // You can add query factory methods here
  static async findByName(name: string): Promise<Preference | null> {
    return this.findOne({ where: { name } });
  }

  // You can add more methods here if needed
}