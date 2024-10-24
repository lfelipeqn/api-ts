import { Model, DataTypes, Sequelize, Association, HasManyGetAssociationsMixin } from 'sequelize';
import { ProductLine } from './ProductLine';
import { DataSheet } from './DataSheet';
import { DataSheetFieldBase } from '../types/models';

export class DataSheetField extends Model<DataSheetFieldBase> {
  public id!: number;
  public field_name!: string;
  public type!: string;
  public values!: string | null;
  public use_to_filter!: boolean;
  public use_to_compare!: boolean;
  public product_line_id!: number;

  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  // Associations
  public readonly productLine?: ProductLine;
  public readonly dataSheets?: DataSheet[];
  public getDataSheets!: HasManyGetAssociationsMixin<DataSheet>

  public static associations: {
    productLine: Association<DataSheetField, ProductLine>;
    dataSheets: Association<DataSheetField, DataSheet>;
  };

  static initModel(sequelize: Sequelize): typeof DataSheetField {
    DataSheetField.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      field_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      values: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      use_to_filter: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      use_to_compare: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      created_at: '',
      updated_at: ''
    }, {
      sequelize,
      tableName: 'data_sheet_fields',
      timestamps: true,
      underscored: true,
    });

    return DataSheetField;
  }

  static associate(models: any) {
    DataSheetField.belongsTo(models.ProductLine, { foreignKey: 'product_line_id', as: 'productLine' });
    DataSheetField.belongsToMany(models.DataSheet, {
      through: models.DataSheetValue,
      foreignKey: 'data_sheet_field_id',
      otherKey: 'data_sheet_id',
      as: 'dataSheets'
    });
  }
}