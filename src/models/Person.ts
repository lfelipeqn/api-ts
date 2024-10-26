import { Model, DataTypes, Sequelize, Association, BelongsToGetAssociationMixin } from 'sequelize';
import { File } from './File';
import { User } from './User';
import { 
  PersonAttributes, 
  PersonCreationAttributes, 
  PersonUpdateData,
  IdentificationType,
  IDENTIFICATION_TYPES 
} from '../types/person';

export class Person extends Model<PersonAttributes, PersonCreationAttributes> {
  declare id: number;
  declare identification_type: IdentificationType;
  declare identification_number: string;
  declare first_name: string;
  declare last_name: string | null;
  declare date_of_birth: Date | null;
  declare cell_phone_1: string | null;
  declare cell_phone_1_whatsapp: boolean;
  declare cell_phone_2: string | null;
  declare cell_phone_2_whatsapp: boolean;
  declare address: string | null;
  declare email: string | null;
  declare shoe_size: string | null;
  declare pants_size: string | null;
  declare shirt_size: string | null;
  declare file_id: number | null;
  declare curriculum_vitae_id: number | null;
  declare dni_id: number | null;

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  declare readonly imgProfile?: File;
  declare readonly fileCv?: File;
  declare readonly fileIdentification?: File;
  declare readonly user?: User;

  // Association getters
  declare getImgProfile: BelongsToGetAssociationMixin<File>;
  declare getFileCv: BelongsToGetAssociationMixin<File>;
  declare getFileIdentification: BelongsToGetAssociationMixin<File>;
  declare getUser: BelongsToGetAssociationMixin<User>;

  public static associations: {
    imgProfile: Association<Person, File>;
    fileCv: Association<Person, File>;
    fileIdentification: Association<Person, File>;
    user: Association<Person, User>;
  };

  static validateIdentificationType(type: string): type is IdentificationType {
    return IDENTIFICATION_TYPES.includes(type as IdentificationType);
  }

  static getIdentificationTypes(): IdentificationType[] {
    return [...IDENTIFICATION_TYPES];
  }

  static initModel(sequelize: Sequelize): typeof Person {
    Person.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      identification_type: {
        type: DataTypes.ENUM(...IDENTIFICATION_TYPES),
        allowNull: false,
        validate: {
          isIn: {
            args: [IDENTIFICATION_TYPES],
            msg: 'Invalid identification type'
          }
        }
      },
      identification_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      date_of_birth: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cell_phone_1: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cell_phone_1_whatsapp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cell_phone_2: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cell_phone_2_whatsapp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true
        }
      },
      shoe_size: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pants_size: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      shirt_size: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      curriculum_vitae_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      dni_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'persons',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['identification_type', 'identification_number']
        },
        {
          fields: ['email']
        }
      ],
      hooks: {
        beforeValidate: async (person: Person) => {
          if (person.identification_type && !Person.validateIdentificationType(person.identification_type)) {
            throw new Error(`Invalid identification type: ${person.identification_type}`);
          }
        }
      }
    });

    return Person;
  }

  static associate(models: {
    File: typeof File;
    User: typeof User;
  }): void {
    Person.belongsTo(models.File, { foreignKey: 'file_id', as: 'imgProfile' });
    Person.belongsTo(models.File, { foreignKey: 'curriculum_vitae_id', as: 'fileCv' });
    Person.belongsTo(models.File, { foreignKey: 'dni_id', as: 'fileIdentification' });
    Person.hasOne(models.User, { foreignKey: 'person_id', as: 'user' });
  }

  fullName(): string {
    return `${this.first_name}${this.last_name ? ` ${this.last_name}` : ''}`;
  }

  async assingAndStoreImageProfile(imageProfile: Express.Multer.File): Promise<void> {
    const t = await this.sequelize!.transaction();
    
    try {
      const file = await this.getImgProfile();
      
      if (file) {
        await file.replaceFile(imageProfile, t);
      } else {
        const newFile = await File.create({
          name: `profile_${this.id}_${Date.now()}${this.getFileExtension(imageProfile.originalname)}`,
          location: `persons/${this.id}/profile`,
        }, { transaction: t });

        await newFile.storeFile(imageProfile);
        await this.update({ file_id: newFile.id }, { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async assingAndStoreCV(fileCV: Express.Multer.File): Promise<void> {
    const t = await this.sequelize!.transaction();
    
    try {
      const file = await this.getFileCv();
      
      if (file) {
        await file.replaceFile(fileCV, t);
      } else {
        const newFile = await File.create({
          name: `cv_${this.id}_${Date.now()}${this.getFileExtension(fileCV.originalname)}`,
          location: `persons/${this.id}/cv`,
        }, { transaction: t });

        await newFile.storeFile(fileCV);
        await newFile.setVisibility(false);
        await this.update({ curriculum_vitae_id: newFile.id }, { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async assingAndStoreDni(fileDNI: Express.Multer.File): Promise<void> {
    const t = await this.sequelize!.transaction();
    
    try {
      const file = await this.getFileIdentification();
      
      if (file) {
        await file.replaceFile(fileDNI, t);
      } else {
        const newFile = await File.create({
          name: `dni_${this.id}_${Date.now()}${this.getFileExtension(fileDNI.originalname)}`,
          location: `persons/${this.id}/dni`,
        }, { transaction: t });

        await newFile.storeFile(fileDNI);
        await newFile.setVisibility(false);
        await this.update({ dni_id: newFile.id }, { transaction: t });
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async getImage(size: string = "md"): Promise<Buffer> {
    const file = await this.getImgProfile();
    if (!file) {
      throw new Error("Profile image not found");
    }
    return file.downloadFile();
  }

  async getCv(): Promise<Buffer> {
    const file = await this.getFileCv();
    if (!file) {
      throw new Error("CV not found");
    }
    return file.downloadFile();
  }

  async getDni(): Promise<Buffer> {
    const file = await this.getFileIdentification();
    if (!file) {
      throw new Error("DNI not found");
    }
    return file.downloadFile();
  }

  private getFileExtension(filename: string): string {
    return filename.substring(filename.lastIndexOf('.'));
  }
}