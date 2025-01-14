import { 
  Model, 
  DataTypes, 
  Sequelize, 
  Association,
  BelongsToGetAssociationMixin,
  BelongsToManyGetAssociationsMixin,
  BelongsToManySetAssociationsMixin,
  BelongsToManyAddAssociationsMixin,
  BelongsToManyRemoveAssociationsMixin,
  Transaction
} from 'sequelize';

import { Product } from './Product';
import { Brand } from './Brand';
import { ProductLine } from './ProductLine';
import { File } from './File';
import { FileWithDetails } from '../types/file';
import {
  BasePromotionAttributes,
  PromotionUpdateData,
  PROMOTION_STATES,
  PROMOTION_TYPES,
  PROMOTION_PRODUCT_APPLICATIONS,
  PROMOTION_SERVICE_APPLICATIONS,
  PromotionState,
  PromotionType,
  PromotionProductApplication,
  PromotionServiceApplication
} from '../types/promotion';
//import { OrderPriceHistory } from './OrderPriceHistory';
import { roundToThousand } from '../utils/price';

interface PromotionAttributes extends BasePromotionAttributes {}
interface PromotionCreationAttributes extends Omit<PromotionAttributes, 'id' | 'created_at' | 'updated_at'> {}

export class Promotion extends Model<PromotionAttributes, PromotionCreationAttributes> {
  declare id: number;
  declare name: string;
  declare discount: number;
  declare state: PromotionState;
  declare type: PromotionType;
  declare automatically_generated: boolean;
  declare applies_to_products: PromotionProductApplication | null;
  declare applies_to_services: PromotionServiceApplication | null;
  declare start_date: Date;
  declare end_date: Date;
  declare user_id: number;
  declare product_line_id: number | null;
  declare service_line_id: number | null;
  declare file_id: number | null;

  // Timestamps
  declare readonly created_at: Date;
  declare readonly updated_at: Date;

  // Associations
  declare readonly products?: Product[];
  declare readonly brands?: Brand[];
  declare readonly productLine?: ProductLine;
  declare readonly file?: File;

  // Association methods
  declare getProducts: BelongsToManyGetAssociationsMixin<Product>;
  declare getBrands: BelongsToManyGetAssociationsMixin<Brand>;
  declare getProductLine: BelongsToGetAssociationMixin<ProductLine>;
  declare getFile: BelongsToGetAssociationMixin<File>;
  declare setProducts: BelongsToManySetAssociationsMixin<Product, number>;
  declare setBrands: BelongsToManySetAssociationsMixin<Brand, number>;
  declare addProducts: BelongsToManyAddAssociationsMixin<Product, number>;
  declare addBrands: BelongsToManyAddAssociationsMixin<Brand, number>;
  declare removeProducts: BelongsToManyRemoveAssociationsMixin<Product, number>;
  declare removeBrands: BelongsToManyRemoveAssociationsMixin<Brand, number>;

  public static associations: {
    products: Association<Promotion, Product>;
    brands: Association<Promotion, Brand>;
    productLine: Association<Promotion, ProductLine>;
    file: Association<Promotion, File>;
  };

  static getStates(): PromotionState[] {
    return [...PROMOTION_STATES];
  }

  static getTypes(): PromotionType[] {
    return [...PROMOTION_TYPES];
  }

  static getProductApplications(): PromotionProductApplication[] {
    return [...PROMOTION_PRODUCT_APPLICATIONS];
  }

  static getServiceApplications(): PromotionServiceApplication[] {
    return [...PROMOTION_SERVICE_APPLICATIONS];
  }

  // Helper method to validate state
  static isValidState(state: string): state is PromotionState {
    return PROMOTION_STATES.includes(state as PromotionState);
  }

  // Helper method to validate type
  static isValidType(type: string): type is PromotionType {
    return PROMOTION_TYPES.includes(type as PromotionType);
  }

  // Helper method to validate product application
  static isValidProductApplication(application: string): application is PromotionProductApplication {
    return PROMOTION_PRODUCT_APPLICATIONS.includes(application as PromotionProductApplication);
  }

  // Helper method to validate service application
  static isValidServiceApplication(application: string): application is PromotionServiceApplication {
    return PROMOTION_SERVICE_APPLICATIONS.includes(application as PromotionServiceApplication);
  }

  static initModel(sequelize: Sequelize): typeof Promotion {
    Promotion.init({
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      discount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        get() {
          const value = this.getDataValue('discount');
          return value === null ? null : parseFloat(value.toString());
        }
      },
      state: {
        type: DataTypes.ENUM(...PROMOTION_STATES),
        allowNull: false,
        defaultValue: 'DRAFT'
      },
      type: {
        type: DataTypes.ENUM(...PROMOTION_TYPES),
        allowNull: false,
      },
      automatically_generated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      applies_to_products: {
        type: DataTypes.ENUM(...PROMOTION_PRODUCT_APPLICATIONS),
        allowNull: true,
      },
      applies_to_services: {
        type: DataTypes.ENUM(...PROMOTION_SERVICE_APPLICATIONS),
        allowNull: true,
      },
      start_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      end_date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
      },
      product_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      service_line_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      file_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      created_at: DataTypes.DATE,
      updated_at: DataTypes.DATE
    }, {
      sequelize,
      tableName: 'promotions',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ['state']
        },
        {
          fields: ['start_date', 'end_date']
        },
        {
          fields: ['product_line_id']
        }
      ]
    });

    return Promotion;
  }

  static associate(models: {
    Product: typeof Product;
    Brand: typeof Brand;
    ProductLine: typeof ProductLine;
    File: typeof File;
  }) {
    if (!models.Product || !models.Brand || !models.ProductLine || !models.File) {
      throw new Error('Required models not provided to Promotion.associate');
    }

    Promotion.belongsToMany(models.Product, {
      through: 'promotions_products', // Just specify the table name
      foreignKey: 'promotion_id',
      otherKey: 'product_id',
      as: 'products'
    });
    Promotion.belongsToMany(models.Brand, {
      through: 'promotions_brands',
      foreignKey: 'promotion_id',
      otherKey: 'brand_id',
      as: 'brands'
    });

    Promotion.belongsTo(models.ProductLine, {
      foreignKey: 'product_line_id',
      as: 'productLine'
    });

    Promotion.belongsTo(models.File, {
      foreignKey: 'file_id',
      as: 'file'
    });
  }

  async getInfo(): Promise<{
    id: number;
    name: string;
    discount: number;
    state: string;
    type: string;
    start_date: Date;
    end_date: Date;
    products?: Product[];
    brands?: Brand[];
    productLine?: ProductLine;
    file?: FileWithDetails;
  }> {
    await this.reload({
      include: [
        'products',
        'brands',
        'productLine',
        {
          model: File,
          as: 'file'
        }
      ]
    });

    const fileInstance = new File();
    const file = this.file ? await fileInstance.processFileDetails({
      ...this.file.toJSON(),
      products_files: { principal: true }
    }) : undefined;

    return {
      ...this.toJSON(),
      file
    };
  }

  // Update the updateFull method to use our new methods
  async updateFull(
    data: PromotionUpdateData, 
    file?: Express.Multer.File, 
    transaction?: Transaction
  ): Promise<void> {
    const t = transaction || await this.sequelize!.transaction();

    try {
      // Validate state if provided
      if (data.state && !Promotion.isValidState(data.state)) {
        throw new Error(`Invalid state: ${data.state}`);
      }

      // Validate type if provided
      if (data.type && !Promotion.isValidType(data.type)) {
        throw new Error(`Invalid type: ${data.type}`);
      }

      // Validate product application if provided
      if (data.applies_to_products && !Promotion.isValidProductApplication(data.applies_to_products)) {
        throw new Error(`Invalid product application: ${data.applies_to_products}`);
      }

      // Validate service application if provided
      if (data.applies_to_services && !Promotion.isValidServiceApplication(data.applies_to_services)) {
        throw new Error(`Invalid service application: ${data.applies_to_services}`);
      }

      // Update basic fields
      await this.update({
        ...data,
        product_line_id: null,
        service_line_id: null
      }, { transaction: t });

      // Handle product-related associations
      switch (data.applies_to_products) {
        case 'SPECIFIC':
          if (data.products?.length) {
            await this.assignProducts(data.products, t);
          }
          break;
          
        case 'BRAND':
          if (data.brands?.length) {
            await this.assignBrands(data.brands, t);
          }
          break;
          
        case 'LINE':
          await this.update({ 
            product_line_id: data.product_line_id || null 
          }, { transaction: t });
          break;
      }

      // Handle service-related associations
      switch (data.applies_to_services) {
        case 'SPECIFIC':
          if (data.services?.length) {
            await this.assignProducts(data.services, t);
          }
          break;
          
        case 'LINE':
          await this.update({ 
            service_line_id: data.service_line_id || null 
          }, { transaction: t });
          break;
      }

      // Handle file upload if provided
      if (file) {
        await this.handleFileUpload(file, t);
      }

      if (!transaction) {
        await t.commit();
      }
    } catch (error) {
      if (!transaction) {
        await t.rollback();
      }
      throw error;
    }
  }

  /**
   * Helper method to validate promotion dates
   */
  validateDates(): boolean {
    if (!this.start_date || !this.end_date) {
      return false;
    }

    const startDate = new Date(this.start_date);
    const endDate = new Date(this.end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return false;
    }

    return startDate <= endDate;
  }

  /**
   * Helper method to check if promotion is expired
   */
  isExpired(): boolean {
    const now = new Date();
    const endDate = new Date(this.end_date);
    return endDate < now;
  }

  /**
   * Helper method to check if promotion has started
   */
  hasStarted(): boolean {
    const now = new Date();
    const startDate = new Date(this.start_date);
    return startDate <= now;
  }

  private async handleFileUpload(file: Express.Multer.File, transaction?: Transaction): Promise<void> {
    try {
      if (this.file_id) {
        const existingFile = await File.findByPk(this.file_id);
        if (existingFile) {
          await existingFile.replaceFile(file, transaction);
          if (this.isImage(file.originalname)) {
            await existingFile.generateImageSizes();
          }
          return;
        }
      }

      const newFile = await File.create({
        name: this.generateFileName(file.originalname),
        location: `promotions/${this.id}`,
      }, { transaction });

      await newFile.storeFile(file);
      
      if (this.isImage(file.originalname)) {
        await newFile.generateImageSizes();
      }

      await this.update({ file_id: newFile.id }, { transaction });
    } catch (error) {
      console.error('Error handling file upload:', error);
      throw new Error('Failed to handle file upload');
    }
  }

  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const extension = originalName.split('.').pop();
    const safeName = originalName
      .split('.')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    return `${safeName}-${timestamp}.${extension}`;
  }

  private isImage(filename: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
  }

  calculateDiscountAmount(price: number): number {
  // Validate price
  if (price < 0) {
    throw new Error('Price cannot be negative');
  }

  let discountAmount = 0;
  switch (this.type) {
    case 'FIXED':
      discountAmount = Math.min(this.discount, price);
      break;
    
    case 'PERCENTAGE':
      if (this.discount < 0 || this.discount > 100) {
        throw new Error('Percentage discount must be between 0 and 100');
      }
      discountAmount = (price * this.discount) / 100;
      break;
    
    default:
      throw new Error(`Invalid promotion type: ${this.type}`);
  }

  // Round the discount amount to the nearest thousand
   // Calculate final price with discount
   const finalPrice = Math.max(0, price - discountAmount);
   // Round the final price to nearest thousand
   const roundedFinalPrice = roundToThousand(finalPrice);
   // Recalculate the actual discount amount based on rounded final price
   return price - roundedFinalPrice;
}

  async isActive(): Promise<boolean> {
    const now = new Date();

    // Basic state check
    if (this.state !== 'ACTIVE') {
      return false;
    }

    // Date validation
    if (!this.start_date || !this.end_date) {
      return false;
    }

    // Ensure dates are Date objects
    const startDate = new Date(this.start_date);
    const endDate = new Date(this.end_date);

    // Validate date range
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return false;
    }

    // Check if promotion is within its valid date range
    return (
      startDate <= now &&
      endDate >= now
    );
  }

  /**
   * Set associated products for the promotion
   * @param productIds Array of product IDs or Product instances
   * @param transaction Optional transaction for the operation
   */
  async assignProducts(
    productIds: Array<number | Product>,
    transaction?: Transaction
  ): Promise<void> {
    try {
      // Convert any Product instances to IDs
      const ids = productIds.map(product => 
        typeof product === 'number' ? product : product.id
      );

      // Validate that all products exist
      const existingProducts = await Product.findAll({
        where: { id: ids },
        transaction
      });

      if (existingProducts.length !== ids.length) {
        const foundIds = existingProducts.map(p => p.id);
        const missingIds = ids.filter(id => !foundIds.includes(id));
        throw new Error(`Some products were not found: ${missingIds.join(', ')}`);
      }

      // Use the Sequelize-provided setter
      await this.setProducts(ids, { transaction });
    } catch (error) {
      console.error('Error assigning products to promotion:', error);
      throw new Error(`Failed to assign products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set associated brands for the promotion
   * @param brandIds Array of brand IDs or Brand instances
   * @param transaction Optional transaction for the operation
   */
  async assignBrands(
    brandIds: Array<number | Brand>,
    transaction?: Transaction
  ): Promise<void> {
    try {
      // Convert any Brand instances to IDs
      const ids = brandIds.map(brand => 
        typeof brand === 'number' ? brand : brand.id
      );

      // Validate that all brands exist
      const existingBrands = await Brand.findAll({
        where: { id: ids },
        transaction
      });

      if (existingBrands.length !== ids.length) {
        const foundIds = existingBrands.map(b => b.id);
        const missingIds = ids.filter(id => !foundIds.includes(id));
        throw new Error(`Some brands were not found: ${missingIds.join(', ')}`);
      }

      // Use the Sequelize-provided setter
      await this.setBrands(ids, { transaction });
    } catch (error) {
      console.error('Error assigning brands to promotion:', error);
      throw new Error(`Failed to assign brands: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add brands to the promotion without removing existing ones
   * @param brandIds Array of brand IDs or Brand instances
   * @param transaction Optional transaction for the operation
   */
  async addPromotionBrands(
    brandIds: Array<number | Brand>,
    transaction?: Transaction
  ): Promise<void> {
    try {
      const ids = brandIds.map(brand => 
        typeof brand === 'number' ? brand : brand.id
      );

      // Validate brands exist
      const existingBrands = await Brand.findAll({
        where: { id: ids },
        transaction
      });

      if (existingBrands.length !== ids.length) {
        const foundIds = existingBrands.map(b => b.id);
        const missingIds = ids.filter(id => !foundIds.includes(id));
        throw new Error(`Some brands were not found: ${missingIds.join(', ')}`);
      }

      await this.addBrands(ids, { transaction });
    } catch (error) {
      console.error('Error adding brands to promotion:', error);
      throw new Error(`Failed to add brands: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove products from the promotion
   * @param productIds Array of product IDs or Product instances
   * @param transaction Optional transaction for the operation
   */
  async removePromotionProducts(
    productIds: Array<number | Product>,
    transaction?: Transaction
  ): Promise<void> {
    try {
      const ids = productIds.map(product => 
        typeof product === 'number' ? product : product.id
      );
      await this.removeProducts(ids, { transaction });
    } catch (error) {
      console.error('Error removing products from promotion:', error);
      throw new Error(`Failed to remove products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove brands from the promotion
   * @param brandIds Array of brand IDs or Brand instances
   * @param transaction Optional transaction for the operation
   */
  async removePromotionBrands(
    brandIds: Array<number | Brand>,
    transaction?: Transaction
  ): Promise<void> {
    try {
      const ids = brandIds.map(brand => 
        typeof brand === 'number' ? brand : brand.id
      );
      await this.removeBrands(ids, { transaction });
    } catch (error) {
      console.error('Error removing brands from promotion:', error);
      throw new Error(`Failed to remove brands: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get promotion status with detailed information
   */
  getStatus(): {
    isActive: boolean;
    hasStarted: boolean;
    isExpired: boolean;
    daysUntilStart?: number;
    daysUntilExpiration?: number;
  } {
    const now = new Date();
    const startDate = new Date(this.start_date);
    const endDate = new Date(this.end_date);

    const isActive = this.state === 'ACTIVE' && startDate <= now && endDate >= now;
    const hasStarted = startDate <= now;
    const isExpired = endDate < now;

    const result: ReturnType<typeof this.getStatus> = {
      isActive,
      hasStarted,
      isExpired
    };

    // Calculate days until start if not started
    if (!hasStarted) {
      result.daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Calculate days until expiration if not expired
    if (!isExpired) {
      result.daysUntilExpiration = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return result;
  }

}