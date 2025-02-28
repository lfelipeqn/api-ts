import {
  Model,
  DataTypes,
  Sequelize,
  Association,
  BelongsToManyGetAssociationsMixin,
  HasManyGetAssociationsMixin,
  Op,
  fn,
  col
} from 'sequelize';
import { Product } from './Product';
import { Brand } from './Brand';
import { DataSheetField } from './DataSheetField';
import { DataSheet } from './DataSheet';
import { DataSheetValue } from './DataSheetValue'
import { DataSheetBase, DataSheetFieldBase } from '../types/models';

interface DataSheetWithFields extends DataSheetBase {
  dataSheetFields: Array<{
    id: number;
    field_name: string;
    DataSheetValue: {
      value: string;
    };
  }>;
}

interface ProductLineAttributes {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

interface ProductLineCreationAttributes {
  name: string;
}

interface FilterResult {
  data_sheet_field: number;
  label: string;
  values: string[];
}

interface FilterableField {
  id: number;
  field_name: string;
  type: string;
  values: string[] | null;
  current_values?: string[];
}

export class ProductLine extends Model<ProductLineAttributes, ProductLineCreationAttributes> {
  declare id: number;
  declare name: string;

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  public readonly products?: Product[];
  public readonly brands?: Brand[];
  public readonly dataSheetFields?: DataSheetField[];

  // Define association mixins
  public getProducts!: HasManyGetAssociationsMixin<Product>;
  public getBrands!: BelongsToManyGetAssociationsMixin<Brand>;
  public getDataSheetFields!: HasManyGetAssociationsMixin<DataSheetField>;

  public static associations: {
    products: Association<ProductLine, Product>;
    brands: Association<ProductLine, Brand>;
    dataSheetFields: Association<ProductLine, DataSheetField>;
  };

  static initModel(sequelize: Sequelize): typeof ProductLine {
    ProductLine.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
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
      tableName: 'product_lines',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['name'],
        }
      ]
    });

    return ProductLine;
  }

  static associate(models: {
    Product: typeof Product;
    Brand: typeof Brand;
    DataSheetField: typeof DataSheetField;
  }): void {
    if (!models.Product || !models.Brand || !models.DataSheetField) {
      throw new Error('Required models not provided to ProductLine.associate');
    }

    ProductLine.hasMany(models.Product, {
      foreignKey: 'product_line_id',
      as: 'products',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    ProductLine.belongsToMany(models.Brand, {
      through: 'brands_product_lines',
      foreignKey: 'product_line_id',
      otherKey: 'brand_id',
      as: 'brands'
    });

    ProductLine.hasMany(models.DataSheetField, {
      foreignKey: 'product_line_id',
      as: 'dataSheetFields',
      onDelete: 'CASCADE'
    });
  }

  // Methods
  async filters(): Promise<FilterResult[]> {
    try {
      const dataSheetFields = await this.getDataSheetFields({
        where: { use_to_filter: true }
      });

      return Promise.all(dataSheetFields.map(async (field) => {
        if (field.type === 'Seleccionable' && field.values) {
          return {
            data_sheet_field: field.id,
            label: field.field_name,
            values: field.values.split(',').map(value => value.trim())
          };
        } else {
          try {
            const dataSheets = await field.getDataSheets({
              where: { 
                product_id: { 
                  [Op.not]: null 
                } 
              },
              include: [{
                model: DataSheetField,
                as: 'dataSheetFields',
                through: { 
                  attributes: ['value']
                }
              }],
              order: [['dataSheetFields', 'value', 'ASC']]
            }) as unknown as DataSheetWithFields[];

            const values = [...new Set(dataSheets.flatMap(ds =>
              ds.dataSheetFields.map(dsf => dsf.DataSheetValue.value)
            ))].filter(Boolean);

            return {
              data_sheet_field: field.id,
              label: field.field_name,
              values: values
            };
          } catch (error) {
            console.error(`Error getting data sheets for field ${field.id}:`, error);
            return {
              data_sheet_field: field.id,
              label: field.field_name,
              values: []
            };
          }
        }
      }));
    } catch (error) {
      console.error('Error getting filters:', error);
      throw new Error('Failed to get filters');
    }
  }

  async getFilterableFields(): Promise<FilterableField[]> {
    try {
      const fields = await DataSheetField.findAll({
        where: {
          product_line_id: this.id,
          use_to_filter: true
        }
      });
  
      return await Promise.all(fields.map(async field => {
        // Get unique values currently in use for this field
        const values = await DataSheetValue.findAll({
          attributes: [
            [fn('DISTINCT', col('value')), 'value']
          ],
          include: [{
            model: DataSheet,
            as: 'dataSheet',
            where: { 
              product_line_id: this.id 
            },
            attributes: []
          }],
          where: { 
            data_sheet_field_id: field.id 
          },
          raw: true
        });
  
        const fieldValues = field.type === 'Seleccionable' && field.values ? 
          field.values.split(',').map(v => v.trim()) : 
          null;
  
        return {
          id: field.id,
          field_name: field.field_name,
          type: field.type,
          values: fieldValues,
          current_values: values.map((v: any) => v.value).filter(Boolean)
        };
      }));
    } catch (error) {
      console.error('Error getting filterable fields:', error);
      throw error;
    }
  }

}