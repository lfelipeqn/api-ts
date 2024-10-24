import { 
  Model, 
  DataTypes, 
  Sequelize, 
  BelongsToGetAssociationMixin,
  BelongsToManyGetAssociationsMixin,
  BelongsToManyAddAssociationMixin,
  BelongsToManyRemoveAssociationMixin,
  BelongsToManyHasAssociationMixin,
  HasManyGetAssociationsMixin,
  NonAttribute,
  FindOptions,
  Op,
  Transaction,
  Optional
} from 'sequelize';

import { Brand } from './Brand';
import { ProductLine } from './ProductLine';
import { File } from './File';
import { Cache } from '../services/Cache';
import { PriceHistory } from './PriceHistory';
import { StockHistory } from './StockHistory';
import { AgencyProduct } from './AgencyProduct';
import { DataSheet } from './DataSheet';
import { DataSheetField } from './DataSheetField';
import { DataSheetValue } from './DataSheetValue';
import path from 'path';

interface DataSheetResponse {
  id: number;
  name: string;
  year: number;
  fields: Array<{
    id: number;
    name: string;
    type: string;
    value: string;
  }>;
}

interface ProductInfoWithDataSheet extends Omit<ProductInfo, 'data_sheet'> {
  data_sheet?: DataSheetResponse;
}

// Enhanced interfaces
interface ProductFile {
  id: number;
  product_id: number;
  file_id: number;
  principal: boolean;
  created_at?: Date;
  updated_at?: Date;
}

interface FileWithDetails {
  id: number;
  name: string;
  location: string;
  mime_type: string;
  size: number;
  original_name: string;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
  products_files?: ProductFile;
  url: string;
  sizes: ImageSizes;
}

interface ImageSizes {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  original: string;
}

interface DataSheetWithFields extends DataSheet {
  dataSheetFields?: Array<DataSheetField & {
    DataSheetValue?: {
      value: string;
    };
  }>;
}

type ProductInfo = Omit<Product, 'files'> & {
  brand?: Brand | null;
  productLine?: ProductLine | null;
  files?: FileWithDetails[];
  file_url?: string;
  images?: ImageSizes;
  current_price: number;
  stock: number;
  average_rating?: number;
  total_reviews?: number;
  related_products?: ProductInfo[];
  data_sheet?: DataSheetResponse;
};

interface FileWithThrough extends File {
  products_files?: {
    principal: boolean;
    [key: string]: any;
  };
}

type EnsureProductInfo<T> = T extends ProductInfo 
  ? keyof ProductInfo extends keyof T 
    ? T 
    : never 
  : never;

interface ProductCreationAttributes {
  magister_code?: string;
  display_name: string;
  name: string;
  reference: string;
  description?: string;
  detailed_description?: string;
  state?: boolean;
  recommended?: boolean;
  highlight?: boolean;
  is_product: boolean;
  allow_national_sale?: boolean;
  brand_id: number;
  product_line_id: number;
  process_id?: number;
}

interface PriceHistoryAttributes {
  id: number;
  product_id: number;
  price: number;
  min_final_price: number;
  unit_cost: number;
  user_id: number;
  created_at: Date;
  updated_at: Date;
}

// Price History Creation Attributes
interface PriceHistoryCreationAttributes extends Optional<PriceHistoryAttributes, 'id' | 'created_at' | 'updated_at'> {
  product_id: number;
  price: number;
  user_id: number;
  created_at?: Date;
  [key: string]: any;
}

interface StockHistoryAttributes {
  id: number;
  product_id: number;
  quantity: number;
  previous_stock: number;
  current_stock: number;
  type: 'IN' | 'OUT' | 'ADJUST';
  reference?: string;
  agency_id: number;
  user_id: number;
  created_at: Date;
  updated_at: Date;
}

// Stock History Creation Attributes
interface StockHistoryCreationAttributes extends Optional<StockHistoryAttributes, 'id' | 'created_at' | 'updated_at'> {
  product_id: number;
  quantity: number;
  user_id: number;
  created_at?: Date;
  [key: string]: any; 
}

interface ProductAttributes {
  id: number;
  magister_code: string | null;
  display_name: string;
  name: string;
  reference: string;
  description: string | null;
  detailed_description: string | null;
  state: boolean;
  recommended: boolean;
  highlight: boolean;
  is_product: boolean;
  allow_national_sale: boolean;
  brand_id: number;
  product_line_id: number;
  process_id: number | null;
  created_at?: Date;
  updated_at?: Date;
}

interface FileAssociationOptions extends FindOptions {
  through?: {
    attributes?: string[];
    where?: any;
  };
}

function isSequelizeError(error: any): error is Error & { name: string } {
  return error instanceof Error && 'name' in error;
}

function isFileWithThrough(file: any): file is FileWithThrough {
  return file && 'products_files' in file;
}

function isFileInstance(file: any): file is File {
  return file instanceof File;
}

export class Product extends Model<ProductAttributes, ProductCreationAttributes>  {
  declare id: number;
  declare magister_code: string | null;
  declare display_name: string;
  declare name: string;
  declare reference: string;
  declare description: string | null;
  declare detailed_description: string | null;
  declare state: boolean;
  declare recommended: boolean;
  declare highlight: boolean;
  declare is_product: boolean;
  declare allow_national_sale: boolean;
  declare brand_id: number;
  declare product_line_id: number;
  declare process_id: number | null;
  declare dataSheets?: DataSheetWithFields[];

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  declare brand?: NonAttribute<Brand>;
  declare productLine?: NonAttribute<ProductLine>;
  declare files?: NonAttribute<File[]>;
  declare priceHistories?: NonAttribute<PriceHistory[]>;
  declare stockHistories?: NonAttribute<StockHistory[]>;

  // Association mixins
  declare getBrand: BelongsToGetAssociationMixin<Brand>;
  declare getProductLine: BelongsToGetAssociationMixin<ProductLine>;
  declare getFiles: BelongsToManyGetAssociationsMixin<File>;
  declare addFile: BelongsToManyAddAssociationMixin<File, number>;
  declare removeFile: BelongsToManyRemoveAssociationMixin<File, number>;
  declare hasFile: BelongsToManyHasAssociationMixin<File, number>;
  declare getPriceHistories: HasManyGetAssociationsMixin<PriceHistory>;
  declare getStockHistories: HasManyGetAssociationsMixin<StockHistory>;
  
  toJSON(): EnsureProductInfo<ProductInfo> {
    const json = super.toJSON();
    return {
      ...json,
      // Only set these values if they're not already present
      current_price: (this as any).current_price ?? undefined,
      stock: (this as any).stock ?? undefined,
    } as EnsureProductInfo<ProductInfo>;
  }

  static associate(models: {
    Brand: typeof Brand;
    ProductLine: typeof ProductLine;
    File: typeof File;
    PriceHistory: typeof PriceHistory;
    StockHistory: typeof StockHistory;
    DataSheet: typeof DataSheet;
  }): void {
    if (!models.Brand || !models.ProductLine || !models.File) {
      throw new Error('Required models not provided to Product.associate');
    }
  
    Product.belongsTo(models.Brand, {
      foreignKey: 'brand_id',
      as: 'brand',
      targetKey: 'id'
    });
  
    Product.belongsTo(models.ProductLine, {
      foreignKey: 'product_line_id',
      as: 'productLine',
      targetKey: 'id'
    });
  
    Product.belongsToMany(models.File, {
      through: 'products_files',
      foreignKey: 'product_id',
      otherKey: 'file_id',
      as: 'files'
    });
  
    Product.hasMany(models.PriceHistory, {
      foreignKey: 'product_id',
      as: 'priceHistories'
    });
  
    Product.hasMany(models.StockHistory, {
      foreignKey: 'product_id',
      as: 'stockHistories'
    });

    Product.hasMany(models.DataSheet, {
      foreignKey: 'product_id',
      as: 'dataSheets'
    });
  }

  private async convertToProductInfo(product: Pick<Product, keyof ProductAttributes>): Promise<ProductInfo> {
    // If it's this instance, use instance methods
    if (product instanceof Product) {
      return {
        ...product.toJSON(),
        current_price: await product.getCurrentPrice(),
        stock: await product.getCurrentStock(),
        brand: await product.getBrand(),
        productLine: await product.getProductLine(),
        files: await product.getProductFiles().then(files => 
          Promise.all(files.map(file => this.getProcessedFileDetails(file)))
        )
      };
    }
  
    // If it's a plain object from a query, convert it directly
    const productData = {
      ...product,
      current_price: 0,
      stock: 0,
      brand: null,
      productLine: null,
      files: [],
      // Convert null to undefined for optional fields
      magister_code: product.magister_code || undefined,
      description: product.description || undefined,
      detailed_description: product.detailed_description || undefined,
      process_id: product.process_id || undefined
    } as unknown as ProductInfo;
  
    // Load basic associations if needed
    const brandPromise = Brand.findByPk(product.brand_id);
    const productLinePromise = ProductLine.findByPk(product.product_line_id);
  
    const [brand, productLine] = await Promise.all([
      brandPromise,
      productLinePromise
    ]);
  
    productData.brand = brand || undefined;
    productData.productLine = productLine || undefined;
  
    return productData;
  }
  

  // Cache keys
  private static readonly CACHE_KEY_PREFIX = 'product:';
  private static readonly CACHE_DURATION = 3600; // 1 hour

  static initModel(sequelize: Sequelize): typeof Product {
    Product.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      magister_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      display_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      reference: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      detailed_description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      state: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      recommended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      highlight: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_product: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      allow_national_sale: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      brand_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      process_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    },{
      sequelize,
      tableName: 'products',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['magister_code'],
          unique: true,
          where: {
            magister_code: { [Op.ne]: null }
          }
        },
        {
          fields: ['reference'],
          unique: true
        },
        {
          fields: ['brand_id']
        },
        {
          fields: ['product_line_id']
        }
      ],
      hooks: {
        afterCreate: async (instance: Product) => {
          await instance.clearAllCache();
        },
        afterUpdate: async (instance: Product) => {
          await instance.clearAllCache();
        },
        afterDestroy: async (instance: Product) => {
          await instance.clearAllCache();
        },
        afterBulkUpdate: async (options: any) => {
          if (options.where?.id) {
            const ids = Array.isArray(options.where.id) 
              ? options.where.id 
              : [options.where.id];
            await Promise.all(
              ids.map((id:any) => Cache.getInstance().del(`${Product.CACHE_KEY_PREFIX}${id}`))
            );
          }
        }
      }
    });

    return Product;
  }

  async processFileDetails(file: File): Promise<FileWithDetails> {
    const fileData = file.toJSON();
    const imageSizes = file.getImageSizesUrl();
  
    return {
      ...fileData,
      url: file.getUrl(),
      sizes: this.processImageSizes(imageSizes),
      products_files: (file as any).products_files || undefined
    };
  }

  async getProductFiles(): Promise<File[]> {
    return this.getFiles({
      attributes: ['id', 'name', 'location', 'mime_type', 'size', 'original_name'],
      include: [{
        association: 'products_files',
        attributes: ['principal']
      }]
    } as FileAssociationOptions);
  }

  private formatPrice(price: number): number {
    return Math.round(price * 100) / 100;
  }

  private async getSimilarProductsInfo(limit: number = 5): Promise<ProductInfo[]> {
    const similarProducts = await Product.findAll({
      where: {
        id: { [Op.ne]: this.id },
        brand_id: this.brand_id,
        product_line_id: this.product_line_id,
        state: true
      },
      limit,
      order: [['recommended', 'DESC'], ['created_at', 'DESC']],
      include: [
        {
          model: Brand,
          as: 'brand'
        },
        {
          model: ProductLine,
          as: 'productLine'
        }
      ]
    });
  
    // Convert and return similar products with basic info
    return Promise.all(
      similarProducts.map(async (product): Promise<ProductInfo> => {
        const basicInfo = product.toJSON();
        return {
          ...basicInfo,
          current_price: 0, // Default or simplified values for similar products
          stock: 0,
          brand: product.brand,
          productLine: product.productLine,
          // Don't include files or related_products for similar products
          files: undefined,
          related_products: undefined
        };
      })
    );
  }
  // Enhanced file handling methods
  async uploadAndAssociateFile(
    file: Express.Multer.File,
    isPrincipal: boolean = false,
    transaction?: Transaction
  ): Promise<File> {
    try {
      const newFile = await File.create({
        name: this.generateFileName(file.originalname), // Generate a safe filename
        original_name: file.originalname,
        location: `products/${this.id}`,
        mime_type: file.mimetype,
        size: file.size,
        metadata: {
          uploadedBy: 'product',
          productId: this.id,
          originalName: file.originalname,
          contentType: file.mimetype
        }
      }, { transaction });
  
      await newFile.storeFile(file);
      
      if (file.mimetype.startsWith('image/')) {
        await newFile.generateImageSizes();
      }
  
      await this.addFile(newFile, {
        through: { principal: isPrincipal },
        transaction
      });
  
      if (isPrincipal) {
        await this.updatePrincipalFile(newFile.id, transaction);
      }
  
      await this.clearCache();
      return newFile;
    } catch (error) {
      if (isSequelizeError(error)) {
        console.error(`Database error: ${error.name}: ${error.message}`);
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }
  
  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const extension = path.extname(originalName);
    const safeName = path.basename(originalName, extension)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    return `${safeName}-${timestamp}${extension}`;
  }

  private async clearCache(): Promise<void> {
    await this.clearAllCache();
  }
  /**
 * Enhanced getInfo method with proper caching
 */
  async getInfo(): Promise<ProductInfoWithDataSheet> {
    try {
      const cache = Cache.getInstance();
      const cacheKey = `${Product.CACHE_KEY_PREFIX}${this.id}:info`;
      
      const cachedInfo = await cache.get<ProductInfoWithDataSheet>(cacheKey);
      if (cachedInfo) {
        return cachedInfo;
      }
  
      // Get base product info
      const [currentPrice, currentStock] = await Promise.all([
        this.getCurrentPrice(),
        this.getCurrentStock()
      ]);
  
      // Create base product info
      const productInfo: Partial<ProductInfoWithDataSheet> = {
        ...this.toJSON(),
        current_price: currentPrice,
        stock: currentStock,
      };
  
      // Load associations in parallel
      const [brand, productLine, files, dataSheet] = await Promise.all([
        this.getBrand().catch(() => null),
        this.getProductLine().catch(() => null),
        this.getFiles({
          attributes: ['id', 'name', 'location', 'mime_type', 'size', 'original_name'],
          include: [{
            association: 'products_files',
            attributes: ['principal']
          }]
        }).catch(() => []),
        DataSheet.findOne({
          where: { product_id: this.id },
          include: [{
            model: DataSheetField,
            as: 'dataSheetFields',
            include: [{
              model: DataSheetValue,
              as: 'DataSheetValue',
              attributes: ['value'],
              where: { data_sheet_id: { [Op.col]: 'DataSheet.id' } }
            }]
          }]
        } as any).catch(() => null) as Promise<DataSheetWithFields | null>
      ]);
  
      // Assign associations
      if (brand) productInfo.brand = brand;
      if (productLine) productInfo.productLine = productLine;
  
      // Process files
      if (files && files.length > 0) {
        productInfo.files = await Promise.all(
          files.map(file => this.processFileDetails(file))
        );
  
        const principalFile = files.find(file => 
          (file as any).products_files?.principal
        );
        
        if (principalFile) {
          productInfo.file_url = principalFile.getUrl();
          const imageSizes = principalFile.getImageSizesUrl();
          productInfo.images = this.processImageSizes(imageSizes);
        }
      }
  
      // Process data sheet
      if (dataSheet && dataSheet.dataSheetFields) {
        productInfo.data_sheet = {
          id: dataSheet.id,
          name: dataSheet.name,
          year: dataSheet.year,
          fields: dataSheet.dataSheetFields.map(field => ({
            id: field.id,
            name: field.field_name,
            type: field.type,
            value: field.DataSheetValue?.value || ''
          }))
        };
      }
  
      await cache.set(cacheKey, productInfo, Product.CACHE_DURATION);
  
      return productInfo as ProductInfoWithDataSheet;
    } catch (error) {
      console.error(`Error getting product info for ${this.id}:`, error);
      throw new Error(`Failed to get product info: ${(error as Error).message}`);
    }
  }
  // Enhanced similar products implementation
  // Update your similarProducts method if you still need it
async similarProducts(limit: number = 5): Promise<Product[]> {
  return Product.findAll({
    where: {
      id: { [Op.ne]: this.id },
      brand_id: this.brand_id,
      product_line_id: this.product_line_id,
      state: true
    },
    limit,
    order: [['recommended', 'DESC'], ['created_at', 'DESC']]
  });
}
  // Enhanced stock management methods
  async updateStock(
    quantity: number,
    userId: number,
    agencyId: number, // Add required agency_id
    transaction?: Transaction
  ): Promise<void> {
    const sequelize = this.sequelize!;
    const StockHistory = sequelize.model('stock_history');
  
    const t = transaction || await sequelize.transaction();
  
    try {
      const currentStock = await this.getCurrentStock();
      if (currentStock + quantity < 0) {
        throw new InsufficientStockError(this.id, quantity, currentStock);
      }
  
      await StockHistory.create({
        product_id: this.id,
        quantity: quantity,
        previous_stock: currentStock,
        current_stock: currentStock + quantity,
        type: quantity > 0 ? 'IN' : 'OUT',
        agency_id: agencyId,
        user_id: userId,
        reference: `Stock update by user ${userId}`
      } satisfies StockHistoryCreationAttributes, { transaction: t });
  
      if (!transaction) {
        await t.commit();
      }
  
      await this.clearAllCache();
    } catch (error) {
      if (!transaction) {
        await t.rollback();
      }
      throw error;
    }
  }

  // Enhanced price management
  async updatePrice(
    newPrice: number,
    // userId: number,  // Commented out userId parameter
    transaction?: Transaction
  ): Promise<void> {
    if (newPrice < 0) {
      throw new InvalidPriceError(this.id, newPrice);
    }
  
    const sequelize = this.sequelize!;
    const PriceHistory = sequelize.model('price_history');
  
    const t = transaction || await sequelize.transaction();
  
    try {
      await PriceHistory.create({
        product_id: this.id,
        price: newPrice,
        min_final_price: newPrice, // Add required fields
        unit_cost: 0, // Add required fields
        user_id: 1 // Temporary default value
      } satisfies PriceHistoryCreationAttributes, { transaction: t });
  
      if (!transaction) {
        await t.commit();
      }
  
      await this.clearAllCache();
    } catch (error) {
      if (!transaction) {
        await t.rollback();
      }
      throw error;
    }
  }

  // Search functionality
  static async search(query: string, options: {
    limit?: number;
    offset?: number;
    brandId?: number;
    productLineId?: number;
    minPrice?: number;
    maxPrice?: number;
  } = {}): Promise<{ rows: Product[]; count: number }> {
    const where: any = {
      state: true,
      [Op.or]: [
        { name: { [Op.like]: `%${query}%` } },
        { display_name: { [Op.like]: `%${query}%` } },
        { reference: { [Op.like]: `%${query}%` } },
        { magister_code: { [Op.like]: `%${query}%` } }
      ]
    };

    if (options.brandId) where.brand_id = options.brandId;
    if (options.productLineId) where.product_line_id = options.productLineId;

    return await Product.findAndCountAll({
      where,
      limit: options.limit || 10,
      offset: options.offset || 0,
      include: [
        { model: Brand, as: 'brand' },
        { model: ProductLine, as: 'productLine' }
      ]
    });
  }

  // Bulk operations
  static async bulkUpdateState(
    ids: number[],
    state: boolean,
    transaction?: Transaction
  ): Promise<number> {
    const [affectedCount] = await Product.update(
      { state },
      {
        where: { id: { [Op.in]: ids } },
        transaction
      }
    );
  
    const cache = Cache.getInstance();
    // Clear cache for all affected products
    await Promise.all(
      ids.map(id => cache.del(`${Product.CACHE_KEY_PREFIX}${id}`))
    );
  
    return affectedCount;
  }
  // Validation methods
  async validate(): Promise<void> {
    if (!this.name || !this.display_name || !this.reference) {
      throw new Error('Required fields are missing');
    }
    // Add any additional validation logic
  }
    /**
     * Get current price from cache or database
     */
    async getCurrentPrice(): Promise<number> {
      try {
        const cache = Cache.getInstance();
        const cacheKey = `${Product.CACHE_KEY_PREFIX}${this.id}:price`;
        
        const cachedPrice = await cache.get<number>(cacheKey);
        if (cachedPrice !== null) {
          return this.formatPrice(parseFloat(cachedPrice.toString()));
        }
    
        const price = await this.getPriceFromDatabase();
        
        if (price > 0) {
          await cache.set(cacheKey, price, Product.CACHE_DURATION);
        }
        
        return this.formatPrice(price);
      } catch (error) {
        if (isSequelizeError(error)) {
          console.error(`Database error: ${error.name}: ${error.message}`);
          throw error;
        }
        console.error(`Error getting current price for product ${this.id}:`, error);
        return 0;
      }
    }

    async updateAgencyStock(
      agencyId: number,
      quantity: number,
      userId: number,
      type: 'IN' | 'OUT' | 'ADJUST' = 'ADJUST',
      reference?: string,
      transaction?: Transaction
    ): Promise<void> {
      const t = transaction || await this.sequelize!.transaction();
    
      try {
        const agencyProduct = await AgencyProduct.findOne({
          where: {
            product_id: this.id,
            agency_id: agencyId
          },
          transaction: t
        });
    
        if (!agencyProduct && quantity < 0) {
          throw new InsufficientStockError(this.id, quantity, 0);
        }
    
        const previousStock = agencyProduct?.current_stock || 0;
        const newStock = previousStock + quantity;
    
        if (newStock < 0) {
          throw new InsufficientStockError(this.id, quantity, previousStock);
        }
    
        await AgencyProduct.upsert({
          product_id: this.id,
          agency_id: agencyId,
          current_stock: newStock,
          state: true
        }, { transaction: t });
    
        await StockHistory.create({
          quantity,
          previous_stock: previousStock,
          current_stock: newStock,
          type,
          reference,
          product_id: this.id,
          agency_id: agencyId,
          user_id: userId
        } satisfies StockHistoryCreationAttributes, { transaction: t });
    
        if (!transaction) {
          await t.commit();
        }
    
        await this.clearAllCache();
      } catch (error) {
        if (!transaction) {
          await t.rollback();
        }
        throw error;
      }
    }

  /**
   * Get current stock from cache or database
   */
  async getCurrentStock(): Promise<number> {
    try {
      const cache = Cache.getInstance();
      const cacheKey = `${Product.CACHE_KEY_PREFIX}${this.id}:stock`;
      
      const cachedStock = await cache.get<number>(cacheKey);
      if (cachedStock !== null) {
        return cachedStock;
      }
  
      const totalStock = await AgencyProduct.sum('current_stock', {
        where: {
          product_id: this.id,
          state: true
        }
      });
  
      const stock = totalStock || 0;
      await cache.set(cacheKey, stock, 300); // Cache for 5 minutes
      
      return stock;
    } catch (error) {
      if (isSequelizeError(error)) {
        console.error(`Database error: ${error.name}: ${error.message}`);
        throw error;
      }
      console.error(`Error getting current stock for product ${this.id}:`, error);
      return 0;
    }
  }
  
  
  async getStockByAgency(agencyId: number): Promise<number> {
    const agencyProduct = await AgencyProduct.findOne({
      where: {
        product_id: this.id,
        agency_id: agencyId,
        state: true
      }
    });
  
    return agencyProduct?.current_stock || 0;
  }

  /**
   * Clear all related cache entries for this product
   */
  private async clearAllCache(): Promise<void> {
    const cache = Cache.getInstance();
    const keys = [
      `${Product.CACHE_KEY_PREFIX}${this.id}`,
      `${Product.CACHE_KEY_PREFIX}${this.id}:info`,
      `${Product.CACHE_KEY_PREFIX}${this.id}:price`,
      `${Product.CACHE_KEY_PREFIX}${this.id}:stock`
    ];
    
    await Promise.all(
      keys.map(key => cache.del(key))
    );
  }
  /**
 * Enhanced update method with cache clearing
 */
async update(values: Partial<ProductCreationAttributes>, options?: any): Promise<this> {
  const result = await super.update(values, options);
  await this.clearAllCache();
  return result;
}
// Enhanced search with cache
static async searchWithCache(query: string, options: {
  limit?: number;
  offset?: number;
  brandId?: number;
  productLineId?: number;
  minPrice?: number;
  maxPrice?: number;
} = {}): Promise<{ rows: Product[]; count: number }> {
  const cache = Cache.getInstance();
  const cacheKey = `search:${query}:${JSON.stringify(options)}`;
  
  // Try to get from cache
  const cachedResults = await cache.get<{ rows: Product[]; count: number }>(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }

  // If not in cache, perform search
  const results = await Product.search(query, options);
  
  // Cache for 5 minutes
  await cache.set(cacheKey, results, 300);
  
  return results;
}

  public async updatePrincipalFile(newPrincipalFileId: number, transaction?: Transaction): Promise<void> {
    const sequelize = this.sequelize!;
    const ProductFiles = sequelize.model('products_files');
    
    try {
      await ProductFiles.update(
        { principal: false },
        { 
          where: { 
            product_id: this.id,
            file_id: { [Op.ne]: newPrincipalFileId }
          },
          transaction
        }
      );

      await ProductFiles.update(
        { principal: true },
        {
          where: {
            product_id: this.id,
            file_id: newPrincipalFileId
          },
          transaction
        }
      );

      await this.clearAllCache();
    } catch (error:any) {
      if (isSequelizeError(error)) {
        console.error(`Database error: ${error.name}: ${error.message}`);
        throw error;
      }
      console.error('Error updating principal file:', error);
      throw new Error(`Failed to update principal file: ${error.message}`);
    }
  }

  public async setPrincipalImage(fileId: number, transaction?: Transaction): Promise<void> {
    // Validate that the file exists and belongs to this product
    const hasFile = await this.hasFile(fileId);
    if (!hasFile) {
      throw new Error('File is not associated with this product');
    }
  
    await this.updatePrincipalFile(fileId, transaction);
  }

  /**
   * Remove a file from the product
   */
  async removeProductFile(fileId: number, deleteFile: boolean = true, transaction?: Transaction): Promise<void> {
    try {
      const file = await File.findByPk(fileId);
      if (!file) return;

      await this.removeFile(file, { transaction });

      if (deleteFile) {
        await file.fullDelete();
      }

      await this.clearAllCache();
    } catch (error:any) {
      if (isSequelizeError(error)) {
        console.error(`Database error: ${error.name}: ${error.message}`);
        throw error;
      }
      console.error('Error removing file:', error);
      throw new Error(`Failed to remove file: ${error.message}`);
    }
  }

  /**
 * Replace existing file
 */
  async replaceProductFile(
    fileId: number, 
    newFile: Express.Multer.File,
    transaction?: Transaction
  ): Promise<File> {
    try {
      const existingFile = await File.findByPk(fileId);
      if (!existingFile) {
        throw new Error('File not found');
      }
  
      const hasFile = await this.hasFile(existingFile);
      if (!hasFile) {
        throw new Error('File is not associated with this product');
      }
  
      // Update the file properties
      existingFile.original_name = newFile.originalname;
      existingFile.mime_type = newFile.mimetype;
      existingFile.size = newFile.size;
      existingFile.metadata = {
        ...existingFile.metadata,
        lastUpdated: new Date().toISOString(),
        originalName: newFile.originalname,
        contentType: newFile.mimetype
      };
  
      await existingFile.replaceFile(newFile, transaction);
      await existingFile.save({ transaction });
  
      // Regenerate image sizes if it's an image
      if (newFile.mimetype.startsWith('image/')) {
        await existingFile.generateImageSizes();
      }
  
      await this.clearAllCache();
  
      return existingFile;
    } catch (error:any) {
      if (isSequelizeError(error)) {
        console.error(`Database error: ${error.name}: ${error.message}`);
        throw error;
      }
      console.error('Error replacing file:', error);
      throw new Error(`Failed to replace file: ${error.message}`);
    }
  }

  // Implement the database methods
  private async getPriceFromDatabase(): Promise<number> {
    try {
      const latestPrice = await PriceHistory.findOne({
        where: { product_id: this.id },
        order: [['created_at', 'DESC']],
        attributes: ['price'],
        raw: true
      });
  
      if (!latestPrice) {
        console.log(`No price found for product ${this.id}`);
        return 0;
      }
  
      const price = parseFloat(latestPrice.price.toString());
      return this.formatPrice(price);
    } catch (error) {
      console.error('Error fetching price from database:', error);
      return 0;
    }
  }

  private async getStockFromDatabase(): Promise<number> {
    const sequelize = this.sequelize!;
    const query = `
      SELECT SUM(quantity) as total_stock 
      FROM stock_history 
      WHERE product_id = :productId
    `;

    const [result]: any[] = await sequelize.query(query, {
      replacements: { productId: this.id },
      raw: true
    });

    return result?.[0]?.total_stock || 0;
  }

  async getProductImages(): Promise<{
    principal?: FileWithDetails;
    others: FileWithDetails[];
  }> {
    const files = await this.getProductFiles();
    
    const processedFiles = await Promise.all(
      files.map(file => this.processFileDetails(file))
    );
  
    return {
      principal: processedFiles.find(file => file.products_files?.principal),
      others: processedFiles.filter(file => !file.products_files?.principal)
    };
  }

  private processImageSizes(imageSizes: Record<string, string>): ImageSizes {
    return {
      xs: imageSizes['xs'] || '',
      sm: imageSizes['sm'] || '',
      md: imageSizes['md'] || '',
      lg: imageSizes['lg'] || '',
      original: imageSizes['original'] || ''
    };
  }

  async associateFiles(
    files: Express.Multer.File[],
    principalIndex: number = 0,
    transaction?: Transaction
  ): Promise<File[]> {
    const t = transaction || await this.sequelize!.transaction();
  
    try {
      const uploadedFiles = await Promise.all(
        files.map((file, index) => 
          this.uploadAndAssociateFile(
            file,
            index === principalIndex,
            t
          )
        )
      );
  
      if (!transaction) {
        await t.commit();
      }
  
      return uploadedFiles;
    } catch (error) {
      if (!transaction) {
        await t.rollback();
      }else if (isSequelizeError(error)) {
        console.error(`Database error: ${error.name}: ${error.message}`);
      }
      throw error;
    }
  }

  async getPrincipalImage(): Promise<FileWithDetails | undefined> {
    const images = await this.getProductImages();
    return images.principal;
  }

  private async getProcessedFileDetails(file: File): Promise<FileWithDetails> {
    const fileJson = file.toJSON();
    const throughData = (file as any).products_files;
    const sizes = file.getImageSizesUrl();
  
    const fileDetails: FileWithDetails = {
      ...fileJson,
      url: file.getUrl(),
      sizes: {
        xs: sizes['xs'] || '',
        sm: sizes['sm'] || '',
        md: sizes['md'] || '',
        lg: sizes['lg'] || '',
        original: sizes['original'] || ''
      },
      products_files: throughData,
      metadata: fileJson.metadata || null // Ensure metadata is either Record<string, any> or null
    };
  
    return fileDetails;
  }

  async getAllImages(): Promise<FileWithDetails[]> {
    const images = await this.getProductImages();
    return [
      ...(images.principal ? [images.principal] : []),
      ...images.others
    ];
  }

  private isImageFile(file: File): boolean {
    return file.mime_type.startsWith('image/');
  }

}


// Custom error types
export class ProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductError';
  }
}

export class InsufficientStockError extends ProductError {
  constructor(productId: number, requested: number, available: number) {
    super(`Insufficient stock for product ${productId}. Requested: ${requested}, Available: ${available}`);
    this.name = 'InsufficientStockError';
  }
}

export class InvalidPriceError extends ProductError {
  constructor(productId: number, price: number) {
    super(`Invalid price ${price} for product ${productId}`);
    this.name = 'InvalidPriceError';
  }
}