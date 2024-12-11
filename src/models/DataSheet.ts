import { Model, DataTypes, Sequelize, Association, BelongsToManyGetAssociationsMixin } from 'sequelize';

//import { VehicleVersion } from './VehicleVersion';
import { Product } from './Product';
//import { Client } from './Client';
import { ProductLine } from './ProductLine';
import { DataSheetField } from './DataSheetField';
import { DataSheetValue } from './DataSheetValue';

interface DataSheetAttributes {
  id: number;
  name: string;
  year: number;
  original: boolean;
  vehicle_version_id: number | null;
  product_id: number | null;
  client_id: number | null;
  product_line_id: number;
  created_at: Date;
  updated_at: Date;
}


export class DataSheet extends Model<DataSheetAttributes> {
  declare id: number;
  declare name: string;
  declare year: number;
  declare original: boolean;
  declare vehicle_version_id: number | null;
  declare product_id: number | null;
  declare client_id: number | null;
  declare product_line_id: number;

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  //public readonly vehicleVersion?: VehicleVersion;
  public readonly product?: Product;
  //public readonly client?: Client;
  public readonly productLine?: ProductLine;
  public readonly dataSheetFields?: DataSheetField[];

  public getDataSheetFields!: BelongsToManyGetAssociationsMixin<DataSheetField>;

  public static associations: {
    //vehicleVersion: Association<DataSheet, VehicleVersion>;
    product: Association<DataSheet, Product>;
    //client: Association<DataSheet, Client>;
    productLine: Association<DataSheet, ProductLine>;
    dataSheetFields: Association<DataSheet, DataSheetField>;
  };

  

  static initModel(sequelize: Sequelize): typeof DataSheet {
    DataSheet.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      original: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      vehicle_version_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      product_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      client_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      created_at: '',
      updated_at: ''
    }, {
      sequelize,
      tableName: 'data_sheets',
      timestamps: true,
      underscored: true,
    });

    return DataSheet;
  }

  static associate(models: {
    Product: typeof Product;
    ProductLine: typeof ProductLine;
    DataSheetField: typeof DataSheetField;
    DataSheetValue: typeof DataSheetValue;
  }) {
    //DataSheet.belongsTo(models.VehicleVersion, { foreignKey: 'vehicle_version_id', as: 'vehicleVersion' });
    DataSheet.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    //DataSheet.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
    DataSheet.belongsTo(models.ProductLine, { foreignKey: 'product_line_id', as: 'productLine' });
    DataSheet.belongsToMany(models.DataSheetField, {
      through: models.DataSheetValue,
      foreignKey: 'data_sheet_id',
      otherKey: 'data_sheet_field_id',
      as: 'dataSheetFields'
    });
    
    DataSheet.hasMany(models.DataSheetValue, {
      foreignKey: 'data_sheet_id',
      as: 'values'
    });
  }

  async hasValue(data_sheet_field_id: number, value: string): Promise<boolean> {
    const dataSheetValues = await DataSheetValue.findOne({
      where: {
        data_sheet_id: this.id,
        data_sheet_field_id: data_sheet_field_id,
        value: value
      }
    });

    return !!dataSheetValues;
  }
}