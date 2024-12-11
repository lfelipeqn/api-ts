import { Model, DataTypes, Sequelize } from 'sequelize';
import { DataSheet } from '../models/DataSheet';
import { DataSheetField } from '../models/DataSheetField';

interface DataSheetValueAttributes {
  id: number;
  data_sheet_id: number;
  data_sheet_field_id: number;
  value: string;
  created_at: Date;
  updated_at: Date;
}

export class DataSheetValue extends Model<DataSheetValueAttributes> {
  declare id: number;
  declare data_sheet_id: number;
  declare data_sheet_field_id: number;
  declare value: string;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  static initModel(sequelize: Sequelize): typeof DataSheetValue {
    DataSheetValue.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      data_sheet_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'data_sheets',
          key: 'id'
        }
      },
      data_sheet_field_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: 'data_sheet_fields',
          key: 'id'
        }
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      }
    }, {
      sequelize,
      tableName: 'data_sheet_values',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['data_sheet_id', 'data_sheet_field_id'],
          unique: true
        }
      ]
    });

    return DataSheetValue;
  }

  static associate(models: {
    DataSheet: typeof DataSheet;
    DataSheetField: typeof DataSheetField;
  }) {
    DataSheetValue.belongsTo(models.DataSheet, {
      foreignKey: 'data_sheet_id',
      as: 'dataSheet'
    });
  
    DataSheetValue.belongsTo(models.DataSheetField, {
      foreignKey: 'data_sheet_field_id',
      as: 'field'
    });
  }

}