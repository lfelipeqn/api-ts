import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { User } from './User';
import bcrypt from 'bcrypt';

export class UserToken extends Model {
  public id!: number;
  public token!: string;
  public scope!: string | null;
  public data!: string | null;
  public expiration_date!: Date | null;
  public user_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly user?: User;

  public static associations: {
    user: Association<UserToken, User>;
  };

  static initModel(sequelize: Sequelize): typeof UserToken {
    UserToken.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      scope: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      data: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expiration_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'user_tokens',
      timestamps: true,
      underscored: true,
    });

    return UserToken;
  }

  static associate(models: any) {
    UserToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  }

  async hash(): Promise<void> {
    const hashedToken = await bcrypt.hash(this.token, 10);
    await this.update({ token: hashedToken });
  }

  async check(token: string): Promise<boolean> {
    return bcrypt.compare(token, this.token);
  }

  hasExpired(): boolean {
    if (this.expiration_date) {
      return new Date(this.expiration_date) < new Date();
    }
    return false;
  }

  // Static methods (UserTokenStatics equivalent)
  static async generate(
    user: User,
    scope: string | null = null,
    data: string | null = null,
    expirationDate: string | null = null,
    minLength: number = 60,
    maxLength: number = 65,
    onlyNumbers: boolean = false
  ): Promise<UserToken> {
    const tokenLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    const characters = onlyNumbers ? '0123456789' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < tokenLength; i++) {
      token += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return UserToken.create({
      token,
      scope,
      data,
      expiration_date: expirationDate ? new Date(expirationDate) : null,
      user_id: user.id,
    });
  }

  static async findValidToken(token: string, scope: string | null = null): Promise<UserToken | null> {
    const userToken = await UserToken.findOne({
      where: { 
        token,
        scope: scope || null,
      }
    });

    if (userToken && !userToken.hasExpired()) {
      return userToken;
    }

    return null;
  }
}