import { Model, DataTypes, Sequelize, Association, Transaction } from 'sequelize';
import { VehicleLine } from './VehicleLine';
import { DataSheet } from './DataSheet';
import { DataSheetField } from './DataSheetField';
import { File } from './File';

export class VehicleVersion extends Model {
  public id!: number;
  public name!: string;
  public start_year!: number;
  public end_year!: number;
  public vehicle_line_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly vehicleLine?: VehicleLine;
  public readonly dataSheets?: DataSheet[];
  public readonly files?: File[];

  public static associations: {
    vehicleLine: Association<VehicleVersion, VehicleLine>;
    dataSheets: Association<VehicleVersion, DataSheet>;
    files: Association<VehicleVersion, File>;
  };

  static initModel(sequelize: Sequelize): typeof VehicleVersion {
    VehicleVersion.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      start_year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      end_year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      vehicle_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
    }, {
      sequelize,
      tableName: 'vehicle_versions',
      timestamps: true,
      underscored: true,
    });

    return VehicleVersion;
  }

  static associate(models: any) {
    VehicleVersion.belongsTo(models.VehicleLine, { foreignKey: 'vehicle_line_id', as: 'vehicleLine' });
    VehicleVersion.hasMany(models.DataSheet, { foreignKey: 'vehicle_version_id', as: 'dataSheets' });
    VehicleVersion.belongsToMany(models.File, { 
      through: 'files_vehicle_versions',
      foreignKey: 'vehicle_version_id',
      otherKey: 'file_id',
      as: 'files'
    });
  }

  async addDatasheet(data: any, transaction?: Transaction): Promise<boolean | { errors: { name: string } }> {
    const storeDataSheet = async (year: number, fields: DataSheetField[]) => {
      const dataSheet = await DataSheet.create({
        name: data.new_name || null,
        year: year,
        original: data.original ? 1 : 0,
        vehicle_version_id: this.id,
        product_line_id: data.product_line || null
      }, { transaction });

      for (const field of fields) {
        await dataSheet.$add('dataSheetFields', field, { 
          through: { value: data[field.id] || null },
          transaction 
        });
      }

      // TODO: Implement EstablishVehicleVersionCompatibility job equivalent
      // await EstablishVehicleVersionCompatibility.dispatch(dataSheet.id);
    };

    const duplicateDataSheet = async (year: number) => {
      const count = await DataSheet.count({
        where: {
          vehicle_version_id: this.id,
          year: year,
          product_line_id: data.product_line,
          name: data.new_name || null
        },
        transaction
      });
      return count > 0;
    };

    const dataSheetFields = await DataSheetField.findAll({
      where: {
        product_line_id: data.product_line || null,
        use_to_vehicles: true
      },
      transaction
    });

    try {
      if (data.all_years) {
        for (let i = this.start_year; i <= this.end_year; i++) {
          if (await duplicateDataSheet(i)) {
            return { errors: { name: "Nombre de ficha técnica duplicado" } };
          }
          await storeDataSheet(i, dataSheetFields);
        }
      } else {
        if (await duplicateDataSheet(data.year)) {
          return { errors: { name: "Nombre de ficha técnica duplicado" } };
        }
        await storeDataSheet(data.year, dataSheetFields);
      }
      return true;
    } catch (error) {
      console.error('Error adding datasheet:', error);
      return false;
    }
  }

  async dataSheetsLine(product_line: number, year: number): Promise<DataSheet[]> {
    return DataSheet.findAll({
      where: {
        vehicle_version_id: this.id,
        product_line_id: product_line,
        year: year
      },
      include: [{ 
        model: DataSheetField,
        as: 'dataSheetFields',
        through: { attributes: ['value'] }
      }]
    });
  }

  async getImage(year: number, size: string = "md"): Promise<Buffer | { error: string[] }> {
    const image = await this.$get('files', {
      where: { 'files_vehicle_versions.year': year },
      limit: 1
    });

    if (image && image[0]) {
      return image[0].downloadImageResize(size);
    }

    return { error: ["Not found."] };
  }

  async establishCompatibilities(data_sheet_id: number): Promise<void> {
    // TODO: Implement EstablishVehicleVersionCompatibility job equivalent
    // await EstablishVehicleVersionCompatibility.dispatch(data_sheet_id);
  }
}