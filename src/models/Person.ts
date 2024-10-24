import { Model, DataTypes, Sequelize, Association } from 'sequelize';
import { File } from './File';
import { User } from './User';
import { Client } from './Client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export class Person extends Model {
  public id!: number;
  public identification_type!: string;
  public identification_number!: string;
  public first_name!: string;
  public last_name!: string | null;
  public date_of_birth!: Date | null;
  public cell_phone_1!: string | null;
  public cell_phone_1_whatsapp!: boolean;
  public cell_phone_2!: string | null;
  public cell_phone_2_whatsapp!: boolean;
  public address!: string | null;
  public email!: string | null;
  public shoe_size!: string | null;
  public pants_size!: string | null;
  public shirt_size!: string | null;
  public file_id!: number | null;
  public curriculum_vitae_id!: number | null;
  public dni_id!: number | null;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly imgProfile?: File;
  public readonly fileCv?: File;
  public readonly fileIdentification?: File;
  public readonly user?: User;
  public readonly client?: Client;

  public static associations: {
    imgProfile: Association<Person, File>;
    fileCv: Association<Person, File>;
    fileIdentification: Association<Person, File>;
    user: Association<Person, User>;
    client: Association<Person, Client>;
  };

  static initModel(sequelize: Sequelize): typeof Person {
    Person.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      identification_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      identification_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
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
    }, {
      sequelize,
      tableName: 'persons',
      timestamps: true,
      underscored: true,
    });

    return Person;
  }

  static associate(models: any) {
    Person.belongsTo(models.File, { foreignKey: 'file_id', as: 'imgProfile' });
    Person.belongsTo(models.File, { foreignKey: 'curriculum_vitae_id', as: 'fileCv' });
    Person.belongsTo(models.File, { foreignKey: 'dni_id', as: 'fileIdentification' });
    Person.hasOne(models.User, { foreignKey: 'person_id', as: 'user' });
    Person.hasOne(models.Client, { foreignKey: 'person_id', as: 'client' });
  }

  fullName(): string {
    return this.first_name + (this.last_name ? " " + this.last_name : "");
  }

  async assingAndStoreImageProfile(imageProfile: Express.Multer.File): Promise<void> {
    const fileExist = await this.$get('imgProfile');
    if (fileExist) {
      await fileExist.replaceFile(imageProfile);
    } else {
      const fileObj = await File.createAndStoreFile(`app/private/person/${this.id}/profile`, "profile", path.extname(imageProfile.originalname), imageProfile);
      await this.update({
        file_id: fileObj.id
      });
    }
  }

  async assingAndStoreCV(fileCV: Express.Multer.File): Promise<void> {
    const fileExist = await this.$get('fileCv');
    if (fileExist) {
      await fileExist.replaceFile(fileCV);
    } else {
      const fileObj = await File.createAndStoreFile(`app/private/person/${this.id}/cv`, "cv", path.extname(fileCV.originalname), fileCV);
      await fileObj.setVisibility(false);
      await this.update({
        curriculum_vitae_id: fileObj.id
      });
    }
  }

  async assingAndStoreDni(fileDNI: Express.Multer.File): Promise<void> {
    const fileExist = await this.$get('fileIdentification');
    if (fileExist) {
      await fileExist.replaceFile(fileDNI);
    } else {
      const fileObj = await File.createAndStoreFile(`app/private/person/${this.id}/dni`, "dni", path.extname(fileDNI.originalname), fileDNI);
      await fileObj.setVisibility(false);
      await this.update({
        dni_id: fileObj.id
      });
    }
  }

  async getImage(size: string = "md"): Promise<any> {
    const image = await this.$get('imgProfile');
    if (image) {
      return image.downloadImageResize(size);
    } else {
      throw new Error("Not found");
    }
  }

  async getCv(): Promise<any> {
    const file = await this.$get('fileCv');
    if (file) {
      return file.download();
    } else {
      throw new Error("Not found");
    }
  }

  async getDni(): Promise<any> {
    const file = await this.$get('fileIdentification');
    if (file) {
      return file.download();
    } else {
      throw new Error("Not found");
    }
  }
}