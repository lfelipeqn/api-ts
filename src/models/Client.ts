import { Model, DataTypes, Sequelize, Association, BelongsToGetAssociationMixin, HasManyGetAssociationsMixin } from 'sequelize';
import { Person } from './Person';
import { User } from './User';
import { Vehicle } from './Vehicle';
import { ClientStatusHistory } from './ClientStatusHistory';
import { ClientReward } from './ClientReward';
import { Address } from './Address';

interface ClientInfo extends Client {
  person?: Person & {
    user?: User & {
      agency?: any;  // Replace 'any' with your Agency type
      city?: any;    // Replace 'any' with your City type
    };
  };
  contact_histories?: any[];  // Replace 'any' with your ContactHistory type
  client_status_history?: any[];  // Replace 'any' with your ClientStatusHistory type
  vehicles_data?: Vehicle[];
  allowed_states?: string[];
}

export class Client extends Model {
  public id!: number;
  public verification_code!: string | null;
  public verification_code_expiration!: Date | null;
  public promotions_messages!: boolean;
  public news_messages!: boolean;
  public tips_messages!: boolean;
  public state!: string;
  public data_origin!: string | null;
  public legal_representative!: string | null;
  public is_company!: boolean;
  public openpay_id!: string | null;
  public user_id!: number | null;
  public person_id!: number;
  public client_id!: number | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public getPerson!: BelongsToGetAssociationMixin<Person>;
  public getUser!: BelongsToGetAssociationMixin<User>;
  public getVehicles!: HasManyGetAssociationsMixin<Vehicle>;
  public getClientStatusHistories!: HasManyGetAssociationsMixin<ClientStatusHistory>;
  public getClientRewards!: HasManyGetAssociationsMixin<ClientReward>;
  public getAddresses!: HasManyGetAssociationsMixin<Address>;

  // Associations
  public readonly person?: Person;
  public readonly user?: User;
  public readonly vehicles?: Vehicle[];
  public readonly clientStatusHistories?: ClientStatusHistory[];
  public readonly clientRewards?: ClientReward[];
  public readonly addresses?: Address[];

  public static associations: {
    person: Association<Client, Person>;
    user: Association<Client, User>;
    vehicles: Association<Client, Vehicle>;
    clientStatusHistories: Association<Client, ClientStatusHistory>;
    clientRewards: Association<Client, ClientReward>;
    addresses: Association<Client, Address>;
  };

  static initModel(sequelize: Sequelize): typeof Client {
    Client.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      verification_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      verification_code_expiration: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      promotions_messages: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      news_messages: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      tips_messages: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      data_origin: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      legal_representative: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_company: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      openpay_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      person_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    }, {
      sequelize,
      tableName: 'clients',
      timestamps: false,
    });

    return Client;
  }

  static associate(models: any) {
    Client.belongsTo(models.Person, { foreignKey: 'person_id', as: 'person' });
    Client.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Client.hasMany(models.Vehicle, { foreignKey: 'client_id', as: 'vehicles' });
    Client.hasMany(models.ClientStatusHistory, { foreignKey: 'client_id', as: 'clientStatusHistories' });
    Client.hasMany(models.ClientReward, { foreignKey: 'client_id', as: 'clientRewards' });
    Client.hasMany(models.Address, { foreignKey: 'client_id', as: 'addresses' });
  }

  async getInfo(getContactHistory: boolean = false, getVehicles: boolean = false, virtual: boolean = false): Promise<ClientInfo> {
    // Create a plain object from the model instance
    const clientInfo: Partial<ClientInfo> = this.toJSON();
  
    // Fetch person with associations
    const person = await this.getPerson({
      include: [{
        model: User,
        as: 'user',
        include: ['agency', 'city']
      }]
    });
  
    // Assign the person to the client info object
    clientInfo.person = person;
  
    if (!virtual) {
      // Implement allowed_states logic
      clientInfo.allowed_states = []; // Populate with actual allowed states
  
      if (getContactHistory /* && user has permission to view_contact_history */) {
        // Implement contact history and client status history queries
        //const contactHistories = await this.getContactHistories();
        const statusHistories = await this.getClientStatusHistories();
        
        //clientInfo.contact_histories = contactHistories;
        clientInfo.client_status_history = statusHistories;
      }
    }
  
    if (getVehicles) {
      const vehicles = await this.getVehicles();
      clientInfo.vehicles_data = vehicles;
    }
  
    return clientInfo as ClientInfo;
  }

  // Implement other methods like storeUserForClientCredits, setDataOrigin, notifyClientRegistration, etc.

  async storeReferred(data: any): Promise<Client> {
    const person = await Person.create(data);
    const newClient = await Client.create({
      person_id: person.id,
      state: "Cliente referido",
      user_id: person.user ? person.user.id : 0,
      client_id: this.id,
    });

    const clientUser = await User.create({
      email: person.email,
      person_id: person.id,
      agency_id: null/* current user's agency id */,
    });
    // Implement role assignment for clientUser

    await ClientStatusHistory.create({
      old_state: newClient.state,
      new_state: newClient.state,
      data_origin: 'register', // Implement config.settings.client_status_histories_origin.register
      client_id: newClient.id,
    });

    return newClient;
  }

  // Implement other methods...

  async changeState(state: string, origin: string): Promise<void> {
    const oldState = this.state;
    this.state = this.allowStateChange(state, origin);

    await ClientStatusHistory.create({
      old_state: oldState,
      new_state: this.state,
      data_origin: origin, // Implement config.settings.client_status_histories_origin[origin]
      client_id: this.id,
    });

    if (this.state !== oldState) {
      await this.save();
    }
  }

  private allowStateChange(newState: string, origin: string): string {
    // Implement this method based on your config.settings.allowed_states
    // Return either newState or this.state based on the allowed state changes
    return newState;
  }

  // Implement other methods...
}