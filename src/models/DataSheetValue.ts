import { Model, DataTypes, Sequelize } from 'sequelize';
import { DataSheet } from '../models/DataSheet';
import { DataSheetField } from '../models/DataSheetField';
import { Cache } from '../services/Cache';
import { QueryTypes } from 'sequelize';

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
      ],
      hooks: {
        afterCreate: async (instance: DataSheetValue) => {
          await DataSheetValue.invalidateFilterCache(instance.data_sheet_id);
        },
        afterUpdate: async (instance: DataSheetValue) => {
          await DataSheetValue.invalidateFilterCache(instance.data_sheet_id);
        },
        afterDestroy: async (instance: DataSheetValue) => {
          await DataSheetValue.invalidateFilterCache(instance.data_sheet_id);
        },
        // For bulk operations
        afterBulkCreate: async (instances: DataSheetValue[]) => {
          const dataSheetIds = [...new Set(instances.map(i => i.data_sheet_id))];
          await Promise.all(dataSheetIds.map(id => DataSheetValue.invalidateFilterCache(id)));
        },
        afterBulkUpdate: async (options: any) => {
          if (options.attributes.includes('data_sheet_id')) {
            const cache = Cache.getInstance();
            // Clear all product line filter caches since we can't track which ones changed
            await cache.clearPattern('product-line:*:filters');
          }
        },
        afterBulkDestroy: async (options: any) => {
          const cache = Cache.getInstance();
          // Clear all product line filter caches since we can't track which ones changed
          await cache.clearPattern('product-line:*:filters');
        }
      }
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

  static async invalidateFilterCache(dataSheetId: number): Promise<void> {
    try {
      const cache = Cache.getInstance();
      
      // Get the product line ID from the data sheet
      const sequelize = this.sequelize!;
      const [result] = await sequelize.query(`
        SELECT product_line_id 
        FROM data_sheets 
        WHERE id = :dataSheetId
      `, {
        replacements: { dataSheetId },
        type: QueryTypes.SELECT
      });
  
      if (result && (result as any).product_line_id) {
        const productLineId = (result as any).product_line_id;
        await cache.del(`product-line:${productLineId}:filters`);
      }
    } catch (error) {
      console.error('Error invalidating filter cache:', error);
    }
  }

}