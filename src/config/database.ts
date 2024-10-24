// src/config/database.ts
import { Sequelize } from 'sequelize';
import { Product } from '../models/Product';
import { Brand } from '../models/Brand';
import { ProductLine } from '../models/ProductLine';
import { File } from '../models/File';
import { DataSheet } from '../models/DataSheet';
import { DataSheetField } from '../models/DataSheetField';
import { PriceHistory } from '../models/PriceHistory';
import { StockHistory } from '../models/StockHistory';
import { DataSheetValue } from '../models/DataSheetValue';
import { Agency } from '../models/Agency';
import { AgencyProduct } from '../models/AgencyProduct';
import { Address } from '../models/Address';
import { City } from '../models/City';
import { Department } from '../models/Department';

interface Models {
  File: typeof File;
  Address: typeof Address;
  City: typeof City;
  Department: typeof Department;
  Brand: typeof Brand;
  ProductLine: typeof ProductLine;
  Product: typeof Product;
  DataSheet: typeof DataSheet;
  DataSheetField: typeof DataSheetField;
  DataSheetValue: typeof DataSheetValue;
  PriceHistory: typeof PriceHistory;
  StockHistory: typeof StockHistory;
  Agency: typeof Agency;
  AgencyProduct: typeof AgencyProduct;
  
}

export const initializeDatabase = () => {
  const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  });

  // Initialize all models first
  const models: Models = {
    Address: Address.initModel(sequelize),
    City: City.initModel(sequelize),
    Department: Department.initModel(sequelize),
    Agency: Agency.initModel(sequelize),
    Product: Product.initModel(sequelize),
    Brand: Brand.initModel(sequelize),
    ProductLine: ProductLine.initModel(sequelize),
    File: File.initModel(sequelize),
    DataSheet: DataSheet.initModel(sequelize),
    DataSheetValue: DataSheetValue.initModel(sequelize),
    DataSheetField: DataSheetField.initModel(sequelize),
    PriceHistory: PriceHistory.initModel(sequelize),
    StockHistory: StockHistory.initModel(sequelize),
    AgencyProduct: AgencyProduct.initModel(sequelize),
  };

  // Then initialize associations
  Object.values(models).forEach((model) => {
    if (typeof model.associate === 'function') {
      try {
        model.associate(models);
      } catch (error) {
        console.error(`Error initializing associations for model: ${model.name}`, error);
      }
    }
  });

  return {
    sequelize,
    models
  };
};

let database: { sequelize: Sequelize; models: Models } | null = null;

export const getDatabase = () => {
  if (!database) {
    database = initializeDatabase();
  }
  return database;
};

export const getSequelize = () => {
  return getDatabase().sequelize;
};

export const getModels = () => {
  return getDatabase().models;
};