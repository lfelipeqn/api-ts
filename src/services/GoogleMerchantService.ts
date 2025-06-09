// src/services/GoogleMerchantService.ts

import { google } from 'googleapis';
import { Product } from '../models/Product';
import { PriceHistory } from '../models/PriceHistory';
import { Brand } from '../models/Brand';
import { Promotion } from '../models/Promotion';
import { DataSheet } from '../models/DataSheet';
import { DataSheetField } from '../models/DataSheetField';
import { Op, QueryTypes } from 'sequelize';
import { getSequelize } from '../config/database';
import { roundToThousand } from '../utils/price';
import { Cache } from './Cache';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface ProductProductDetail {
  sectionName: string;
  attributeName: string;
  attributeValue: string;
}

interface UploadProgress {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalProducts: number;
  processedProducts: number;
  successCount: number;
  failedCount: number;
  errors: Array<{reference: string; error: string}>;
  startedAt: string;
  completedAt?: string;
  currentProduct?: string;
}

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
  productDetails?: ProductProductDetail[];
  customAttributes?: Array<{
    name: string;
    value: string;
  }>;
}

interface FileQueryResult {
  id: number;
  name: string;
  location: string;
  is_principal: number;
}

export class GoogleMerchantService {
  private static instance: GoogleMerchantService;
  private content: any;
  private readonly merchantId: string;
  private readonly targetCountry: string = 'CO';
  private readonly contentLanguage: string = 'es';
  private readonly projectId: string;
  private readonly baseUrl: string;
  private readonly sequelize = getSequelize();

  private constructor() {
    this.merchantId = process.env.GOOGLE_SHOPPING_MERCHANT_ID || '';
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    this.baseUrl = 'https://batericars.com.co';

    // Get the absolute path to the credentials file
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (!credentialsPath) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set');
    }

    try {
      
      // Check if file exists
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Credentials file not found at ${credentialsPath}`);
      }

      // Load credentials from file
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/content']
      });

      this.content = google.content({
        version: 'v2.1',
        auth
      });
    } catch (error) {
      console.error('Error initializing Google Merchant Service:', {
        error,
        credentialsPath,
        workspaceRoot: process.cwd(),
        envVars: {
          GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS
        }
      });
      throw new Error(`Failed to initialize Google Merchant Service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

  public static getInstance(): GoogleMerchantService {
    if (!GoogleMerchantService.instance) {
      GoogleMerchantService.instance = new GoogleMerchantService();
    }
    return GoogleMerchantService.instance;
  }

  private async formatProductData(product: Product): Promise<GoogleProductData> {
    // Get the base product information with brand and technical data
    const baseProduct = await Product.findByPk(product.id, {
      include: [
        { model: Brand, as: 'brand' },
        { 
          model: DataSheet,
          as: 'dataSheets',
          include: [{
            model: DataSheetField,
            as: 'dataSheetFields',
            through: {
              attributes: ['value']
            }
          }]
        }
      ]
    });

    if (!baseProduct) {
      throw new Error(`Product ${product.id} not found`);
    }

    // Get current price and round it
    const currentPrice = roundToThousand(await product.getCurrentPrice());

    const productDetails: ProductProductDetail[] = [];
    if (baseProduct.dataSheets && baseProduct.dataSheets.length > 0) {
      const dataSheet = baseProduct.dataSheets[0];
      dataSheet.dataSheetFields?.forEach(field => {
        if (field.DataSheetValue?.value) {
          productDetails.push({
            sectionName: "Ficha Técnica",
            attributeName: field.field_name,
            attributeValue: field.DataSheetValue.value
          });
        }
      });
    }
    // Format base product data
    const productData: GoogleProductData = {
      offerId: product.id.toString(),
      title: `${product.display_name} - ${product.reference}`,
      description: product.description || product.display_name,
      link: `${this.baseUrl}/productos/detalle/${product.id}`,
      imageLink: await this.getPrincipalImageUrl(product),
      additionalImageLinks: await this.getAdditionalImageUrls(product),
      contentLanguage: this.contentLanguage,
      targetCountry: this.targetCountry,
      channel: 'online',
      availability: await this.getAvailabilityStatus(product),
      condition: 'new',
      googleProductCategory: '888', // Auto Parts category
      brand: baseProduct.brand?.name || 'Generic',
      price: {
        value: currentPrice.toString(),
        currency: 'COP'
      },
      identifierExists: true,
      productDetails,
      customAttributes: [{
        name: 'reference',
        value: product.reference
      }],
      shipping: [{
        country: 'CO',
        service: 'Standard shipping',
        price: {
          value: '0',
          currency: 'COP'
        }
      }]
    };

    // Add promotions if they exist
    const activePromotion = await this.getActivePromotion(product.id);
    if (activePromotion) {
      const discountedPrice = this.calculateDiscountedPrice(currentPrice, activePromotion);
      productData.salePrice = {
        value: discountedPrice.toString(),
        currency: 'COP'
      };
    }

    return productData;
  }

  private async getAvailabilityStatus(product: Product): Promise<string> {
    const stock = await product.getCurrentStock();
    return stock > 0 ? 'in_stock' : 'out_of_stock';
  }

  private async getPrincipalImageUrl(product: Product): Promise<string> {
    const files = await this.sequelize.query<FileQueryResult>(
      `SELECT f.*, CAST(pf.principal AS UNSIGNED) as is_principal 
       FROM files f 
       JOIN products_files pf ON f.id = pf.file_id 
       WHERE pf.product_id = :productId AND pf.principal = true
       LIMIT 1`,
      {
        replacements: { productId: product.id },
        type: QueryTypes.SELECT
      }
    );

    if (files && files.length > 0) {
      const cdnUrl = process.env.CDN_URL || `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}`;
      const file = files[0];
      return `${cdnUrl}/${file.location}/${file.name}`;
    }
    
    return ''; // Return empty string if no principal image found
  }

  private async getAdditionalImageUrls(product: Product): Promise<string[]> {
    const files = await this.sequelize.query<FileQueryResult>(
      `SELECT f.*, CAST(pf.principal AS UNSIGNED) as is_principal 
       FROM files f 
       JOIN products_files pf ON f.id = pf.file_id 
       WHERE pf.product_id = :productId AND pf.principal = false
       LIMIT 10`,
      {
        replacements: { productId: product.id },
        type: QueryTypes.SELECT
      }
    );

    const cdnUrl = process.env.CDN_URL || `https://storage.googleapis.com/${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}`;
    return files.map((file: FileQueryResult) => `${cdnUrl}/${file.location}/${file.name}`);
  }

  private async getActivePromotion(productId: number) {
    return Promotion.findOne({
      where: {
        state: 'ACTIVE',
        [Op.and]: [
          this.sequelize.literal(`
            (start_date IS NULL OR start_date <= NOW())
            AND
            (end_date IS NULL OR end_date >= NOW())
          `)
        ]
      },
      include: [{
        model: Product,
        as: 'products',
        where: { id: productId },
        required: true,
        through: { attributes: [] }
      }],
      order: [['created_at', 'DESC']]
    });
  }

  private calculateDiscountedPrice(currentPrice: number, promotion: Promotion): number {
    let discountAmount = 0;
    if (promotion.type === 'PERCENTAGE') {
      discountAmount = (currentPrice * promotion.discount) / 100;
    } else {
      discountAmount = promotion.discount;
    }
    return Math.max(0, roundToThousand(currentPrice - discountAmount));
  }

  public async uploadProduct(product: Product): Promise<void> {
    try {
      const productData = await this.formatProductData(product);
      
      await this.content.products.insert({
        merchantId: this.merchantId,
        requestBody: productData
      });

      console.log(`Successfully uploaded product ${product.id} to Google Merchant Center`);
    } catch (error) {
      console.error(`Error uploading product ${product.id}:`, error);
      throw error;
    }
  }

  public async updateProduct(product: Product): Promise<void> {
    try {
      const productData = await this.formatProductData(product);
      const formattedProductId = `online:es:CO:${product.id}`;
      
      // Remove offerId from update data
      const updateData = {
        price: productData.price,
        availability: productData.availability,
        ...(productData.salePrice && { salePrice: productData.salePrice })
      };
  
      // Create the URL with updateMask parameter
      const updateMask = ['price', 'availability'];
      if (productData.salePrice) {
        updateMask.push('salePrice');
      }
  
      await this.content.products.update({
        merchantId: this.merchantId,
        productId: formattedProductId,
        updateMask: updateMask.join(','),
        requestBody: updateData
      });
  
      const cache = Cache.getInstance();
      await Promise.all([
        cache.del(`product:${product.id}`),
        cache.del(`product:${product.id}:price`),
        cache.del(`product:${product.id}:stock`)
      ]);
  
      console.log(`Successfully updated product ${product.id} in Google Merchant Center with fields:`, updateMask);
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

  public async uploadAllProducts(
    onProgress?: (progress: { current: number; total: number }) => void,
    uploadId?: string
  ): Promise<{
    success: number;
    failed: number;
    errors: Array<{reference: string; error: string}>;
    uploadId: string;
  }> {
    const products = await Product.findAll({
      where: { state: true },
      order: [['id', 'ASC']]
    });
  
    let success = 0;
    let failed = 0;
    const errors: Array<{reference: string; error: string}> = [];
    const total = products.length;
    const progressId = uploadId || uuidv4();
    const cache = Cache.getInstance();
    
    // Initialize progress tracking
    const initialProgress: UploadProgress = {
      id: progressId,
      status: 'processing',
      totalProducts: total,
      processedProducts: 0,
      successCount: 0,
      failedCount: 0,
      errors: [],
      startedAt: new Date().toISOString()
    };
    
    await cache.set(`google-merchant:upload:${progressId}`, JSON.stringify(initialProgress), 3600); // 1 hour TTL
  
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      // Update current product in progress
      const currentProgress: UploadProgress = {
        id: progressId,
        status: 'processing',
        totalProducts: total,
        processedProducts: i,
        successCount: success,
        failedCount: failed,
        errors: [...errors],
        startedAt: initialProgress.startedAt,
        currentProduct: `${product.reference} (ID: ${product.id})`
      };
      
      await cache.set(`google-merchant:upload:${progressId}`, JSON.stringify(currentProgress), 3600);
      
      try {
        await this.uploadProduct(product);
        success++;
        console.log(`Successfully uploaded product ${product.id} - ${product.reference}`);
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to upload product ${product.id} - ${product.reference}:`, error);
        
        // Retry logic for certain errors
        if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
          console.log(`Rate limit hit, waiting 5 seconds before continuing...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Try once more
          try {
            await this.uploadProduct(product);
            success++;
            failed--; // Correct the failed count since this one succeeded
            console.log(`Retry successful for product ${product.id} - ${product.reference}`);
          } catch (retryError) {
            errors.push({
              reference: product.reference,
              error: retryError instanceof Error ? retryError.message : 'Unknown error after retry'
            });
          }
        } else {
          errors.push({
            reference: product.reference,
            error: errorMessage
          });
        }
      }
  
      if (onProgress) {
        onProgress({ current: i + 1, total });
      }
  
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Update final progress
    const finalProgress: UploadProgress = {
      id: progressId,
      status: 'completed',
      totalProducts: total,
      processedProducts: total,
      successCount: success,
      failedCount: failed,
      errors,
      startedAt: initialProgress.startedAt,
      completedAt: new Date().toISOString()
    };
    
    await cache.set(`google-merchant:upload:${progressId}`, JSON.stringify(finalProgress), 7200); // Keep final result for 2 hours
    
    console.log(`Upload completed - Success: ${success}, Failed: ${failed}`);
    return { success, failed, errors, uploadId: progressId };
  }

  public async syncInventoryAndPrices(
    onProgress?: (progress: { current: number; total: number }) => void
  ): Promise<{
    success: number;
    failed: number;
    errors: Array<{reference: string; error: string}>
  }> {
    const products = await Product.findAll({
      where: { state: true }
    });
  
    let success = 0;
    let failed = 0;
    const errors: Array<{reference: string; error: string}> = [];
    const total = products.length;
  
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
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
  
      if (onProgress) {
        onProgress({ current: i + 1, total });
      }
  
      // Add small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  
    return { success, failed, errors };
  }

  public async getUploadProgress(uploadId: string): Promise<UploadProgress | null> {
    try {
      const cache = Cache.getInstance();
      const progressData = await cache.get<UploadProgress>(`google-merchant:upload:${uploadId}`);
      
      return progressData;
    } catch (error) {
      console.error('Error getting upload progress:', error);
      return null;
    }
  }

  public async cancelUpload(uploadId: string): Promise<boolean> {
    try {
      const cache = Cache.getInstance();
      const progress = await cache.get<UploadProgress>(`google-merchant:upload:${uploadId}`);
      
      if (!progress) {
        return false;
      }
      
      if (progress.status === 'processing') {
        const cancelledProgress: UploadProgress = {
          ...progress,
          status: 'failed',
          completedAt: new Date().toISOString()
        };
        
        await cache.set(`google-merchant:upload:${uploadId}`, JSON.stringify(cancelledProgress), 7200);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error cancelling upload:', error);
      return false;
    }
  }

  public async getAllActiveUploads(): Promise<UploadProgress[]> {
    try {
      const cache = Cache.getInstance();
      const entries = await cache.findByPattern<UploadProgress>('google-merchant:upload:*');
      
      const uploads: UploadProgress[] = entries.map(entry => entry.value);
      
      return uploads.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    } catch (error) {
      console.error('Error getting active uploads:', error);
      return [];
    }
  }
}