// src/types/database.ts
import { Sequelize } from 'sequelize';
import { Product } from '../models/Product';
import { Brand } from '../models/Brand';
import { ProductLine } from '../models/ProductLine';
import { File } from '../models/File';
import { DataSheetField } from '../models/DataSheetField';
import { PriceHistory } from '../models/PriceHistory';
import { StockHistory } from '../models/StockHistory';
import { DataSheetValue } from '../models/DataSheetValue';
import { DataSheet } from '../models/DataSheet';
import { Agency } from '../models/Agency';
import { AgencyProduct } from '../models/AgencyProduct';
import { Address } from '../models/Address';
import { City } from '../models/City';
import { Department } from '../models/Department';
import { Cart } from '../models/Cart';
import { CartDetail } from '../models/CartDetail';
import { Promotion } from '../models/Promotion';
import { User } from '../models/User';
import { Person } from '../models/Person';
import { PromotionProducts } from '../models/PromotionProduct';
import { Payment } from '../models/Payment';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { GatewayConfig } from '../models/GatewayConfig';
import { Order } from '../models/Order';
import { OrderPriceHistory } from '../models/OrderPriceHistory';
import { Role } from '../models/Role';
import { Permission } from '../models/Permission';
import { UserRole } from '../models/UserRole';
import { RolePermission } from '../models/RolePermission';


export interface Models {
  City: typeof City;
  Department: typeof Department;
  Address: typeof Address;
  File: typeof File;
  Brand: typeof Brand;
  ProductLine: typeof ProductLine;
  Product: typeof Product;
  DataSheet: typeof DataSheet;
  DataSheetValue: typeof DataSheetValue;
  DataSheetField: typeof DataSheetField;
  PriceHistory: typeof PriceHistory;
  StockHistory: typeof StockHistory;
  Agency: typeof Agency;
  AgencyProduct: typeof AgencyProduct;
  Cart: typeof Cart;
  CartDetail: typeof CartDetail;
  Promotion: typeof Promotion;
  User: typeof User;
  Person: typeof Person;
  PromotionProducts: typeof PromotionProducts;
  Payment: typeof Payment;
  PaymentMethodConfig: typeof PaymentMethodConfig;
  GatewayConfig: typeof GatewayConfig;
  Order: typeof Order;
  OrderPriceHistory: typeof OrderPriceHistory;
  Role: typeof Role;
  Permission: typeof Permission;
  UserRole: typeof UserRole;
  RolePermission: typeof RolePermission;
}

export interface Database {
  sequelize: Sequelize;
  models: Models;
}