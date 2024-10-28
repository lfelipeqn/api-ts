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
import { Promotion } from '../models/Promotion';
import { User } from '../models/User';
import { Person } from '../models/Person';
import { Cart } from '../models/Cart';
import { CartDetail } from '../models/CartDetail';

import { Models } from '../types/database';

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
    Promotion: Promotion.initModel(sequelize),
    User: User.initModel(sequelize),
    Person: Person.initModel(sequelize),
    Cart: Cart.initModel(sequelize),
    CartDetail: CartDetail.initModel(sequelize),
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