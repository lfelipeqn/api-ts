import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import bcrypt from 'bcrypt'
import { Person } from './Person';
import { Agency } from './Agency';
import { ProductLine } from './ProductLine';
import { City } from './City';
import { Notification } from './Notification';
import { Preference } from './Preference';
import { Role } from './Role';
import { Permission } from './Permission';
import { UserToken } from './UserToken';
import { Client } from './Client';
import { Quote } from './Quote';

export class User extends Model {
  public id!: number;
  public email!: string;
  public state!: string;
  public password!: string;
  public schedule_code!: string | null;
  public identity_verified_at!: Date | null;
  public person_id!: number;
  public agency_id!: number | null;
  public product_line_id!: number | null;
  public social_network_name!: string | null;
  public social_network_user_id!: string | null;
  public token!: string | null;
  public city_id!: number | null;
  public user_id!: number | null;
  public fcm_token!: string | null;

  // Associations
  public readonly person?: Person;
  public readonly agency?: Agency;
  public readonly productLine?: ProductLine;
  public readonly city?: City;
  public readonly notifications?: Notification[];
  public readonly preferences?: Preference[];
  public readonly roles?: Role[];
  public readonly permissions?: Permission[];

  public static associations: {
    person: Association<User, Person>;
    agency: Association<User, Agency>;
    productLine: Association<User, ProductLine>;
    city: Association<User, City>;
    notifications: Association<User, Notification>;
    preferences: Association<User, Preference>;
    roles: Association<User, Role>;
    permissions: Association<User, Permission>;
  };

  static initModel(sequelize: Sequelize): typeof User {
    User.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      schedule_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      identity_verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      person_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      agency_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      social_network_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      social_network_user_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      city_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      fcm_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'users',
      timestamps: false,
    });

    return User;
  }

  static associate(models: any) {
    User.belongsTo(models.Person, { foreignKey: 'person_id', as: 'person' });
    User.belongsTo(models.Agency, { foreignKey: 'agency_id', as: 'agency' });
    User.belongsTo(models.ProductLine, { foreignKey: 'product_line_id', as: 'productLine' });
    User.belongsTo(models.City, { foreignKey: 'city_id', as: 'city' });
    User.belongsToMany(models.Notification, { 
      through: 'users_notifications',
      foreignKey: 'user_id',
      otherKey: 'notification_id',
      as: 'notifications'
    });
    User.belongsToMany(models.Preference, { 
      through: 'users_preferences',
      foreignKey: 'user_id',
      otherKey: 'preference_id',
      as: 'preferences'
    });
    User.belongsToMany(models.Role, { 
      through: 'model_has_roles',
      foreignKey: 'model_id',
      otherKey: 'role_id',
      as: 'roles'
    });
    User.belongsToMany(models.Permission, { 
      through: 'model_has_permissions',
      foreignKey: 'model_id',
      otherKey: 'permission_id',
      as: 'permissions'
    });
  }

  async getInfo(): Promise<User> {
    await this.reload({
      include: ['person', 'roles', 'permissions', 'productLine']
    });
    return this;
  }

  async updateFull(data: any, imageProfile?: Express.Multer.File, fileCV?: Express.Multer.File, fileIdentification?: Express.Multer.File): Promise<void> {
    const person = await this.$get('person');
    if (person) {
      await person.update({
        identification_type: data.identification_type,
        identification_number: data.identification_number,
        first_name: data.first_name,
        last_name: data.last_name,
        date_of_birth: data.date_of_birth,
        cell_phone_1: data.cell_phone_1,
        cell_phone_2: data.cell_phone_2,
        email: data.email,
        address: data.address,
      });

      if (imageProfile) {
        await person.assingAndStoreImageProfile(imageProfile);
      }

      if (fileCV) {
        await person.assingAndStoreCV(fileCV);
      }

      if (fileIdentification) {
        await person.assingAndStoreDni(fileIdentification);
      }
    }

    await this.update({
      email: data.email,
      schedule_code: data.schedule_code,
    });

    const role = await Role.findOne({ where: { name: data.role } });

    this.agency_id = null;
    this.product_line_id = null;

    if (role) {
      if (role.required_agency) {
        this.agency_id = data.agency;
      }

      if (role.required_product_line) {
        this.product_line_id = data.product_line;
      }
    }

    if (data.password) {
      this.password = await bcrypt.hash(data.password, 10);
    }

    await this.save();

    if (role) {
      await this.$set('roles', [role]);
    }

    if (data.permissions && Array.isArray(data.permissions)) {
      await this.$set('permissions', data.permissions);
    } else {
      await this.$set('permissions', []);
    }
  }

  async changePassword(newPassword: string): Promise<void> {
    this.password = await bcrypt.hash(newPassword, 10);
    await this.save();
    // Log the password change event
  }

  async activateAccount(): Promise<void> {
    await this.update({ state: 'Activo' });
    // Log the account activation event
  }

  async generateToken(scope?: string, data?: string, expirationDate?: string, minLength: number = 60, maxLength: number = 65, onlyNumbers: boolean = false): Promise<UserToken> {
    return UserToken.generate(this, scope, data, expirationDate, minLength, maxLength, onlyNumbers);
  }

  async agenciesByCity(includeVirtual: boolean = false): Promise<Agency[]> {
    // Implement the query to get agencies by city
    return [];
  }

  async userCityHasAgency(): Promise<boolean> {
    if (this.city_id) {
      const agencies = await this.agenciesByCity(true);
      return agencies.length > 0;
    }
    return false;
  }

  async setPreference(name: string, value: string): Promise<void> {
    const preference = await Preference.findOne({ where: { name } });
    if (preference) {
      await this.$remove('preferences', preference);
      await this.$add('preferences', preference, { through: { value } });
      // Log the preference setting event
    }
  }

  async formatPreferences(): Promise<Record<string, any>> {
    const preferences = await this.$get('preferences');
    return preferences.reduce((acc, pref) => {
      acc[pref.name] = isNaN(pref.UsersPreferences.value) ? pref.UsersPreferences.value : Number(pref.UsersPreferences.value);
      return acc;
    }, {} as Record<string, any>);
  }

  async setDefaultPreferences(): Promise<void> {
    const showAvailableRewardsAutomatically = await Preference.findOne({ where: { name: 'show_available_rewards_automatically' } });
    const showAvatar = await Preference.findOne({ where: { name: 'show_avatar' } });

    if (showAvailableRewardsAutomatically) {
      await this.$add('preferences', showAvailableRewardsAutomatically, { through: { value: '1' } });
    }

    if (showAvatar) {
      await this.$add('preferences', showAvatar, { through: { value: '1' } });
    }
  }

  async allowed(abort: boolean = true, codeAbort: number = 401): Promise<boolean> {
    // Implement the authorization logic here
    // This will depend on your authentication system and role/permission structure
    return true;
  }

  async sendPasswordResetNotification(token: string): Promise<void> {
    // Implement password reset notification logic
    // This might involve sending an email or other notification
  }

  async sendWelcomeMessage(): Promise<void> {
    if (this.email) {
      const userToken = await this.generateToken('activate account');
      // Implement email sending logic here
      await userToken.hash();
    }
  }

  async saveLogLogin(reference: string, request: any): Promise<void> {
    // Implement login logging logic
    // This might involve creating a log entry in your database
  }

  allowDomainAccess(domain: string): boolean {
    // Implement domain access logic
    return true;
  }

  async sendFacebookPixelEvent(ip: string, userAgent: string): Promise<boolean> {
    // Implement Facebook Pixel event sending logic
    return true;
  }

  async makeWelcomeToken(): Promise<void> {
    const client = await Client.findOne({ where: { person_id: this.person_id } });
    let allow = true;
    if (client) {
      const quotesCount = await Quote.count({
        where: {
          state: 1,
          client_id: client.id
        }
      });
      if (quotesCount > 0) {
        allow = false;
      }
    }
    if (allow) {
      await this.generateToken('welcome-token');
    }
  }

  async getWelcomeToken(): Promise<UserToken | null> {
    return UserToken.findOne({
      where: {
        user_id: this.id,
        scope: 'welcome-token'
      }
    });
  }

  async deleteWelcomeToken(): Promise<void> {
    const userToken = await this.getWelcomeToken();
    if (userToken) {
      await userToken.destroy();
    }
  }

  async hasWelcomeToken(): Promise<boolean> {
    const count = await UserToken.count({
      where: {
        user_id: this.id,
        scope: 'welcome-token'
      }
    });
    return count > 0;
  }
}