import { Model, DataTypes, Sequelize, Association, HasOneGetAssociationMixin,
  ModelStatic, InferAttributes, 
  InferCreationAttributes,
  CreationOptional,
  NonAttribute
 } from 'sequelize';
import { Person } from './Person';
import { Agency } from './Agency';
import { ProductLine } from './ProductLine';
import { City } from './City';
import { Address } from './Address';
import { UserSessionManager } from '../services/UserSessionManager';
import { PasswordHandler } from '../services/PasswordHandler';
import { 
  UserAttributes, 
  UserCreationAttributes, 
  UserUpdateData, 
  UserState,
  USER_STATES,
  TokenData
} from '../types/user';
import bcrypt from 'bcrypt';

export class User extends Model<UserAttributes, UserCreationAttributes> {
  declare id: number;
  declare email: string;
  declare state: UserState;
  declare password: string;
  declare schedule_code: string | null;
  declare identity_verified_at: Date | null;
  declare person_id: number;
  declare agency_id: number | null;
  declare product_line_id: number | null;
  declare social_network_name: string | null;
  declare social_network_user_id: string | null;
  declare token: string | null;
  declare city_id: number | null;
  declare user_id: number | null;

  // Associations
  declare readonly person?: Person;
  declare readonly agency?: Agency;
  declare readonly productLine?: ProductLine;
  declare readonly city?: City;
  declare readonly addresses?: Address[];

  declare getPerson: HasOneGetAssociationMixin<Person>;

  public static associations: {
    person: Association<User, Person>;
    agency: Association<User, Agency>;
    productLine: Association<User, ProductLine>;
    city: Association<User, City>;
    addresses: Association<User, Address>;
  };

  static getStates(): UserState[] {
    return [...USER_STATES];
  }

  static validateState(state: string): state is UserState {
    return USER_STATES.includes(state as UserState);
  }

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
        validate: {
          isEmail: true
        }
      },
      state: {
        type: DataTypes.ENUM(...USER_STATES),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: {
          isIn: {
            args: [USER_STATES],
            msg: 'Invalid user state'
          }
        }
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
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
        type: DataTypes.TEXT,  // Changed to TEXT to store JSON token data
        allowNull: true,
        validate: {
          isValidJSON(value: string) {
            if (value) {
              try {
                JSON.parse(value);
              } catch (e) {
                throw new Error('Invalid token format');
              }
            }
          }
        }
      },
      city_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      }
    }, {
      sequelize,
      tableName: 'users',
      timestamps: false,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['email']
        },
        {
          fields: ['state']
        },
        {
          fields: ['person_id']
        },
        {
          fields: ['agency_id']
        }
      ],
      hooks: {
        beforeCreate: async (user: User) => {
          if (user.password) {
            user.password = await PasswordHandler.hashPassword(user.password);
          }
        },
        beforeUpdate: async (user: User) => {
          if (user.changed('password')) {
            user.password = await PasswordHandler.hashPassword(user.password);
          }
        }
      },
    });

    return User;
  }

  static associate(models: {
    Person: typeof Person;
    Agency: typeof Agency;
    ProductLine: typeof ProductLine;
    City: typeof City;
    Address: typeof Address;
  }) {
    User.belongsTo(models.Person, { foreignKey: 'person_id', as: 'person' });
    User.belongsTo(models.Agency, { foreignKey: 'agency_id', as: 'agency' });
    User.belongsTo(models.ProductLine, { foreignKey: 'product_line_id', as: 'productLine' });
    User.belongsTo(models.City, { foreignKey: 'city_id', as: 'city' });
    User.hasMany(models.Address, { foreignKey: 'user_id', as: 'addresses' });
  }

  // Session Management Methods
  async createSession(): Promise<string> {
    const sessionManager = UserSessionManager.getInstance();
    return sessionManager.createSession(this);
  }

  async destroySession(sessionId: string): Promise<boolean> {
    const sessionManager = UserSessionManager.getInstance();
    return sessionManager.destroySession(sessionId);
  }

  async destroyAllSessions(): Promise<boolean> {
    const sessionManager = UserSessionManager.getInstance();
    return sessionManager.destroyUserSessions(this.id);
  }

  // Authentication Methods}
  // In User model

  async verifyPassword(password: string): Promise<{
    isValid: boolean;
    requiresNewPassword: boolean;
  }> {
    try {
      // Check if password exists and is not empty
      if (!this.password || this.password.trim() === '') {
        console.log('No password stored for user - requires new password');
        return {
          isValid: false,
          requiresNewPassword: true
        };
      }
  
      // Direct bcrypt comparison
      const isValid = await bcrypt.compare(password, this.password);
      
      console.log('Password verification result:', {
        hasPassword: true,
        isValid,
        passwordLength: password.length,
        storedHashLength: this.password.length
      });
  
      return {
        isValid,
        requiresNewPassword: false
      };
    } catch (error) {
      console.error('Password verification error:', error);
      return {
        isValid: false,
        requiresNewPassword: false
      };
    }
  }
  
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      if (!this.isValidResetToken(token)) {
        return false;
      }
  
      // Let the model hooks handle the password hashing
      await this.update({ 
        password: newPassword, // Store plain password, let hooks hash it
        token: null 
      });
  
      await this.destroyAllSessions();
      return true;
    } catch (error) {
      console.error('Error resetting password:', error);
      return false;
    }
  }

  async changePassword(newPassword: string): Promise<void> {
    const hashedPassword = await PasswordHandler.hashPassword(newPassword);
    await this.update({ password: hashedPassword });
    // Optionally destroy all sessions when password changes
    await this.destroyAllSessions();
  }

   /**
   * Create a password reset token and store it in the user model
   */
   async createPasswordResetToken(): Promise<string> {
    const token = PasswordHandler.generateResetToken();
    const tokenData: TokenData = {
      token,
      created_at: new Date()
    };

    await this.update({
      token: JSON.stringify(tokenData)
    });

    return token;
  }

  /**
   * Validate a password reset token
   */
  isValidResetToken(token: string): boolean {
    try {
      if (!this.token) return false;
      
      const tokenData: TokenData = JSON.parse(this.token);
      
      // Check if token matches
      if (tokenData.token !== token) return false;
      
      // Check if token is expired
      if (PasswordHandler.isTokenExpired(new Date(tokenData.created_at))) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating reset token:', error);
      return false;
    }
  }

  /**
   * Clear the reset token
   */
  async clearResetToken(): Promise<void> {
    await this.update({ token: null });
  }


  // User Status Methods
  async activate(): Promise<void> {
    await this.update({ state: 'ACTIVE' });
  }

  async deactivate(): Promise<void> {
    await this.update({ state: 'INACTIVE' });
    await this.destroyAllSessions();
  }

  isActive(): boolean {
    return this.state === 'ACTIVE';
  }

  // Profile Management Methods
  async getInfo(): Promise<User> {
    await this.reload({
      include: [
        'person',
        'agency',
        'productLine',
        'city',
        {
          model: Address,
          as: 'addresses',
          include: [{
            model: City,
            as: 'city'
          }]
        }
      ]
    });
    return this;
  }

  async updateProfile(data: UserUpdateData, imageProfile?: Express.Multer.File): Promise<void> {
    const t = await this.sequelize!.transaction();

    try {
      const person = await this.getPerson();
      if (person && data.person) {
        await person.update({
          first_name: data.person.first_name,
          last_name: data.person.last_name,
          cell_phone_1: data.person.cell_phone_1,
          email: data.email
        }, { transaction: t });

        if (imageProfile) {
          await person.assingAndStoreImageProfile(imageProfile);
        }
      }

      const updateData: Partial<UserAttributes> = {
        email: data.email,
        schedule_code: data.schedule_code,
        agency_id: data.agency_id,
        product_line_id: data.product_line_id,
        city_id: data.city_id
      };

      // Add state to update if provided and valid
      if (data.state && User.validateState(data.state)) {
        updateData.state = data.state;
      }

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof typeof updateData] === undefined) {
          delete updateData[key as keyof typeof updateData];
        }
      });

      await this.update(updateData, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async agenciesByCity(includeVirtual: boolean = false): Promise<Agency[]> {
    if (!this.city_id) return [];
    
    const where: any = { state: 'Activo' };
    if (!includeVirtual) {
      where.is_virtual = false;
    }

    const agencies = await Agency.findAll({
      include: [{
        model: Address,
        as: 'address',
        where: { city_id: this.city_id },
        required: true
      }],
      where
    });

    return agencies;
  }

  async userCityHasAgency(): Promise<boolean> {
    if (this.city_id) {
      const agencies = await this.agenciesByCity(true);
      return agencies.length > 0;
    }
    return false;
  }

  async updateState(newState: UserState): Promise<void> {
    if (!User.validateState(newState)) {
      throw new Error(`Invalid user state: ${newState}`);
    }

    await this.update({ state: newState });

    // Handle state-specific actions
    switch (newState) {
      case 'INACTIVE':
      case 'BLOCKED':
      case 'SUSPENDED':
        await this.destroyAllSessions();
        break;
    }
  }

  isInState(state: UserState): boolean {
    return this.state === state;
  }

  canPerformAction(action: string): boolean {
    // Define allowed actions per state
    const allowedActions: Record<UserState, string[]> = {
      ACTIVE: ['all'],
      PENDING: ['verify', 'update_profile'],
      INACTIVE: ['reactivate'],
      BLOCKED: [],
      SUSPENDED: ['contact_support']
    };

    return allowedActions[this.state]?.includes('all') || 
           allowedActions[this.state]?.includes(action) || 
           false;
  }
}