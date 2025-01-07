// src/services/GoogleMerchantService.ts

import { google } from 'googleapis';
import { Product } from '../models/Product';
import { PriceHistory } from '../models/PriceHistory';
import { Brand } from '../models/Brand';
import { File } from '../models/File';
import { Promotion } from '../models/Promotion';
import { Sequelize, Op } from 'sequelize';

interface GoogleProductData {
  offerId: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks?: string[];
  contentLanguage: string;
  targetCountry: string;
  channel: string;
  availability: string;
  condition: string;
  googleProductCategory: string;
  gtin?: string;
  brand: string;
  price: {
    value: string;
    currency: string;
  };
  salePrice?: {
    value: string;
    currency: string;
  };
  identifierExists?: boolean;
  shipping?: Array<{
    country: string;
    service: string;
    price: {
      value: string;
      currency: string;
    };
  }>;
}

export class GoogleMerchantService {
  private static instance: GoogleMerchantService;
  private content: any;
  private readonly merchantId: string = '5086070867';
  private readonly targetCountry: string = 'CO';
  private readonly contentLanguage: string = 'es';
  private readonly projectId: string;
  private readonly baseUrl: string;

  private constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    this.baseUrl = process.env.APP_URL || 'https://batericars.com.co';

    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/content']
    });

    this.content = google.content({
      version: 'v2.1',
      auth
    });
  }

  public static getInstance(): GoogleMerchantService {
    if (!GoogleMerchantService.instance) {
      GoogleMerchantService.instance = new GoogleMerchantService();
    }
    return GoogleMerchantService.instance;
  }

  private async formatProductData(product: Product): Promise<GoogleProductData> {
    // Load related data
    await product.reload({
      include: [
        { model: Brand, as: 'brand' },
        { model: File, as: 'files' },
        { model: PriceHistory, as: 'priceHistories' }
      ]
    });

    // Get current price and check if there's a promotion
    const currentPrice = await product.getCurrentPrice();
    const pricingInfo = await product.getInfo();
    
    // Get product images
    const images = await File.getByProductId(product.id);
    const processedImages = await Promise.all(
      images.map(file => new File().processFileDetails(file))
    );
    const principalImage = processedImages.find(img => img.products_files?.principal);
    
    // Format base product data
    const productData: GoogleProductData = {
      offerId: product.id.toString(),
      title: product.display_name,
      description: product.description || product.display_name,
      link: `${this.baseUrl}/productos/${product.reference}`,
      imageLink: principalImage?.url || '',
      additionalImageLinks: processedImages
        .filter(img => !img.products_files?.principal)
        .map(img => img.url)
        .slice(0, 10), // Google allows up to 10 additional images
      contentLanguage: this.contentLanguage,
      targetCountry: this.targetCountry,
      channel: 'online',
      availability: await this.getAvailabilityStatus(product),
      condition: 'new',
      googleProductCategory: '888', // Auto Parts category
      brand: product.brand?.name || 'Generic',
      price: {
        value: currentPrice.toString(),
        currency: 'COP'
      },
      identifierExists: true
    };

    // Get active promotions and calculate sale price if applicable
    const now = Sequelize.literal('CURRENT_TIMESTAMP');
    const promotions = await Promotion.findAll({
      where: {
        state: 'ACTIVE',
        [Op.and]: [
          Sequelize.literal(`
            (start_date IS NULL OR start_date <= NOW())
            AND
            (end_date IS NULL OR end_date >= NOW())
          `)
        ]
      },
      include: [{
        model: Product,
        as: 'products',
        where: { id: product.id },
        required: true,
        through: { attributes: [] }
      }],
      order: [['created_at', 'DESC']]
    });

    if (promotions.length > 0) {
      const promotion = promotions[0];
      let discountAmount = 0;

      if (promotion.type === 'PERCENTAGE') {
        discountAmount = (currentPrice * promotion.discount) / 100;
      } else {
        discountAmount = promotion.discount;
      }

      const discountedPrice = Math.max(0, currentPrice - discountAmount);

      productData.salePrice = {
        value: discountedPrice.toString(),
        currency: 'COP'
      };
    }

    // Add shipping information
    productData.shipping = [{
      country: 'CO',
      service: 'Standard shipping',
      price: {
        value: '0',
        currency: 'COP'
      }
    }];

    return productData;
  }

  private async getAvailabilityStatus(product: Product): Promise<string> {
    const stock = await product.getCurrentStock();
    return stock > 0 ? 'in_stock' : 'out_of_stock';
  }

  public async uploadProduct(product: Product): Promise<void> {
    try {
      const productData = await this.formatProductData(product);
      
      await this.content.products.insert({
        merchantId: this.merchantId,
        requestBody: productData
      });

      console.log(`Successfully uploaded product ${product.reference} to Google Merchant Center`);
    } catch (error) {
      console.error(`Error uploading product ${product.reference}:`, error);
      throw error;
    }
  }

  public async updateProduct(product: Product): Promise<void> {
    try {
      const productData = await this.formatProductData(product);
      
      await this.content.products.update({
        merchantId: this.merchantId,
        productId: product.id.toString(),
        requestBody: productData
      });

      console.log(`Successfully updated product ${product.id} in Google Merchant Center`);
    } catch (error) {
      console.error(`Error updating product ${product.id}:`, error);
      throw error;
    }
  }

  public async deleteProduct(productId: number): Promise<void> {
    try {
      await this.content.products.delete({
        merchantId: this.merchantId,
        productId: productId.toString()
      });

      console.log(`Successfully deleted product ${productId} from Google Merchant Center`);
    } catch (error) {
      console.error(`Error deleting product ${productId}:`, error);
      throw error;
    }
  }

  public async uploadAllProducts(): Promise<{
    success: number;
    failed: number;
    errors: Array<{reference: string; error: string}>
  }> {
    const { Product } = require('../models/Product');
    const products = await Product.findAll({
      where: { state: true }
    });

    let success = 0;
    let failed = 0;
    const errors: Array<{reference: string; error: string}> = [];

    for (const product of products) {
      try {
        await this.uploadProduct(product);
        success++;
      } catch (error) {
        failed++;
        errors.push({
          reference: product.reference,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed, errors };
  }

  public async syncInventoryAndPrices(): Promise<{
    success: number;
    failed: number;
    errors: Array<{reference: string; error: string}>
  }> {
    const { Product } = require('../models/Product');
    const products = await Product.findAll({
      where: { state: true }
    });

    let success = 0;
    let failed = 0;
    const errors: Array<{reference: string; error: string}> = [];

    for (const product of products) {
      try {
        await this.updateProduct(product);
        success++;
      } catch (error) {
        failed++;
        errors.push({
          reference: product.reference,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed, errors };
  }
}