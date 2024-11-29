// src/routes/product.routes.ts

import { Router } from 'express';
import { Product } from '../models/Product';
import { DataSheet } from '../models/DataSheet';
import { DataSheetField } from '../models/DataSheetField';
import { DataSheetValue } from '../models/DataSheetValue';
import { Brand } from '../models/Brand';
import { ProductLine } from '../models/ProductLine';
import { PriceHistory } from '../models/PriceHistory';
import multer from 'multer';
import { Op, Sequelize, QueryTypes, Order} from 'sequelize';
import { File } from '../models/File';
import { FileWithDetails, FileWithPrincipal } from '../types/file';
import { Promotion } from '../models/Promotion';
import { PromotionProducts } from '../models/PromotionProduct';


interface ProductImagesResponse {
  principal: FileWithDetails | undefined;
  others: FileWithDetails[];
}

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

const getActivePromotionConditions = () => ({
  state: 'ACTIVE' as const,
  [Op.and]: [
    {
      [Op.or]: [
        { start_date: { [Op.is]: null } },
        { start_date: { [Op.lte]: Sequelize.fn('NOW') } }
      ]
    },
    {
      [Op.or]: [
        { end_date: { [Op.is]: null } },
        { end_date: { [Op.gte]: Sequelize.fn('NOW') } }
      ]
    }
  ]
});

const getProductPricing = async (productId: number) => {
  const latestPrice = await PriceHistory.findOne({
    where: { product_id: productId },
    order: [['created_at', 'DESC']]
  });

  const basePrice = latestPrice ? Number(latestPrice.price) : 0;

  // Get active promotions for this product
  const activePromotions = await Promotion.findAll({
    where: getActivePromotionConditions(),
    include: [{
      model: Product,
      as: 'products',
      where: { id: productId },
      required: true,
      through: { attributes: [] }
    }],
    order: [['created_at', 'DESC']]
  });

  let discountedPrice = basePrice;
  let discountAmount = 0;
  let appliedPromotion = null;

  if (activePromotions.length > 0) {
    const promotion = activePromotions[0];
    if (promotion.type === 'PERCENTAGE') {
      discountAmount = (basePrice * promotion.discount) / 100;
    } else {
      discountAmount = promotion.discount;
    }
    discountedPrice = Math.max(0, basePrice - discountAmount);

    appliedPromotion = {
      id: promotion.id,
      name: promotion.name,
      type: promotion.type,
      discount: promotion.discount
    };
  }

  return {
    base_price: basePrice,
    discounted_price: discountedPrice,
    discount_amount: discountAmount,
    has_discount: discountAmount > 0,
    active_promotion: appliedPromotion
  };
};

// Get product list with pagination and search
router.get('/products', async (req, res) => {
  try {
    const {
      query = '',
      page = 1,
      limit = 10,
      brandId,
      productLineId
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    
    const where: any = {
      state: true,
      [Op.or]: [
        { name: { [Op.like]: `%${query}%` } },
        { display_name: { [Op.like]: `%${query}%` } },
        { reference: { [Op.like]: `%${query}%` } },
        { magister_code: { [Op.like]: `%${query}%` } }
      ]
    };

    if (brandId) where.brand_id = brandId;
    if (productLineId) where.product_line_id = productLineId;

    const results = await Product.findAndCountAll({
      where,
      limit: Number(limit),
      offset,
      include: [
        { 
          model: Brand, 
          as: 'brand',
          include: [{
            model: File,
            as: 'file',
            required: false
          }]
        },
        { model: ProductLine, as: 'productLine' }
      ],
      order: [['created_at', 'DESC']]
    });

    // Process products with pricing info and additional details
    const processedProducts = await Promise.all(
      results.rows.map(async (product) => {
        // Get pricing info
        const pricingInfo = await getProductPricing(product.id);
        
        // Get product images
        const files = await File.getByProductId(product.id);
        const fileInstance = new File();
        const processedImages = await Promise.all(
          files.map(file => fileInstance.processFileDetails(file))
        );
        const principalImage = processedImages.find(img => img.products_files?.principal);

        // Get total stock
        const totalStock = await product.getTotalStock();

        // Process brand image if available
        let brandWithImage = null;
        if (product.brand) {
          const brand = await Brand.findByPk(product.brand.id);
          if (brand) {
            brandWithImage = await brand.toDetailedJSON();
          }
        }

        return {
          ...product.toJSON(),
          ...pricingInfo,
          brand: brandWithImage,
          principalImage: principalImage?.url,
          total_stock: totalStock
        };
      })
    );

    res.json({
      data: processedProducts,
      meta: {
        total: results.count,
        page: Number(page),
        lastPage: Math.ceil(results.count / Number(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ 
      error: 'Failed to fetch products',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get product details
// Update the get product route with better error handling and logging
router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        {
          model: DataSheet,
          as: 'dataSheets',
          required: false,
          include: [{
            model: DataSheetField,
            as: 'dataSheetFields',
            through: {
              attributes: ['value']  // Just specify the attributes we want from the junction table
            }
          }]
        },
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

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const productInfo = await product.getInfo();
    const pricingInfo = await getProductPricing(product.id);
    const dataSheet = product.dataSheets && product.dataSheets[0];

    const dataSheetInfo = dataSheet ? {
      id: dataSheet.id,
      name: dataSheet.name,
      year: dataSheet.year,
      fields: dataSheet.dataSheetFields?.map(field => ({
        id: field.id,
        name: field.field_name,
        type: field.type,
        value: (field as any).DataSheetValue?.value || ''
      })) || []
    } : null;

    const response = {
      ...productInfo,
      ...pricingInfo,
      data_sheet: dataSheetInfo
    };

    res.json(response);
  } catch (error) {
    console.error('Error in GET /products/:id:', error);
    next(error);
  }
});

// Create new product
router.post('/products', async (req, res) => {
  try {
    const productData = req.body;
    const product = await Product.create(productData);
    res.status(201).json(await product.getInfo());
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.update(req.body);
    res.json(await product.getInfo());
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

router.get('/products/:id/images', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get all files associated with the product
    const files = await File.getByProductId(product.id);
    
    // Create a File instance for processing
    const fileInstance = new File();

    // Process each file to include URLs and sizes
    const processedImages = await Promise.all(
      files.map(async (file) => {
        const fileDetails = await fileInstance.processFileDetails(file);
        return fileDetails;
      })
    );

    // Prepare the response
    const response: ProductImagesResponse = {
      principal: processedImages.find(img => img.products_files?.principal),
      others: processedImages.filter(img => !img.products_files?.principal)
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching product images:', error);
    res.status(500).json({ 
      error: 'Failed to fetch product images',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update the POST endpoint for uploading images
router.post('/products/:id/images', upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const files = req.files as Express.Multer.File[];
    const fileIds = req.body.fileIds ? JSON.parse(req.body.fileIds) : [];
    let uploadedFiles: File[] = [];

    // Handle new file uploads
    if (files && files.length > 0) {
      uploadedFiles = await product.associateFiles(files, 0);
    }

    // Handle existing file associations
    if (fileIds.length > 0) {
      const existingFiles = await File.findAll({
        where: { id: { [Op.in]: fileIds } }
      });

      for (const file of existingFiles) {
        await product.addFile(file, {
          through: { principal: false }
        });
      }

      uploadedFiles = [...uploadedFiles, ...existingFiles];
    }

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No files uploaded or associated' });
    }

    // Create a File instance for processing
    const fileInstance = new File();

    // Convert uploaded files to FileWithPrincipal format
    const filesWithPrincipal: FileWithPrincipal[] = uploadedFiles.map(file => ({
      id: file.id,
      name: file.name,
      location: file.location,
      created_at: file.created_at,
      updated_at: file.updated_at,
      products_files: {
        principal: false // Default to false for new uploads
      }
    }));

    // Process files to include URLs and sizes
    const processedFiles: FileWithDetails[] = await Promise.all(
      filesWithPrincipal.map(file => fileInstance.processFileDetails(file))
    );

    res.json(processedFiles);
  } catch (error) {
    console.error('Error uploading/associating images:', error);
    res.status(500).json({ 
      error: 'Failed to upload/associate images',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Set principal image
router.put('/products/:id/images/:fileId/principal', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.updatePrincipalFile(Number(req.params.fileId));
    res.json(await product.getProductImages());
  } catch (error) {
    console.error('Error setting principal image:', error);
    res.status(500).json({ error: 'Failed to set principal image' });
  }
});

// Delete product image
router.delete('/products/:id/images/:fileId', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.removeProductFile(Number(req.params.fileId), true);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Update product stock
router.post('/products/:id/stock', async (req, res) => {
  try {
    const { quantity, agencyId, userId, type, reference } = req.body;
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.updateAgencyStock(
      agencyId,
      Number(quantity),
      userId,
      type,
      reference
    );

    const currentStock = await product.getCurrentStock();
    res.json({ stock: currentStock });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

router.get('/products/:id/total-stock', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const totalStock = await product.getTotalStock();
    
    res.json({ 
      product_id: product.id,
      total_stock: totalStock
    });
  } catch (error) {
    console.error('Error getting total stock:', error);
    res.status(500).json({ 
      error: 'Failed to get total stock',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/products/:id/stock-summary', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stockSummary = await product.getStockSummary();
    
    res.json({
      product_id: product.id,
      ...stockSummary
    });
  } catch (error) {
    console.error('Error getting stock summary:', error);
    res.status(500).json({ 
      error: 'Failed to get stock summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get product stock by agency
router.get('/products/:id/stock/:agencyId', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const agencyId = Number(req.params.agencyId);
    if (isNaN(agencyId)) {
      return res.status(400).json({ error: 'Invalid agency ID' });
    }

    const stock = await product.getStockByAgency(agencyId);
    res.json({ 
      product_id: product.id,
      agency_id: agencyId,
      stock 
    });
  } catch (error) {
    console.error('Error getting stock:', error);
    res.status(500).json({ 
      error: 'Failed to get stock',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update product price
router.post('/products/:id/price', async (req, res) => {
  try {
    const { price, userId } = req.body;
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.updatePrice(Number(price), userId);
    const currentPrice = await product.getCurrentPrice();
    res.json({ price: currentPrice });
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

router.get('/products/:id/similar', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const similarProducts = await Product.findAll({
      where: {
        reference: product.reference,
        id: { [Op.ne]: product.id },
        state: true
      },
      limit: 4,
      include: [
        { model: Brand, as: 'brand' },
        { model: ProductLine, as: 'productLine' }
      ]
    });

    res.json({
      status: 'success',
      data: similarProducts
    });
  } catch (error) {
    console.error('Error fetching similar products:', error);
    res.status(500).json({ 
      error: 'Failed to fetch similar products',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/products/:id/prices', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const latestPrice = await PriceHistory.findOne({
      where: { product_id: product.id },
      order: [['created_at', 'DESC']]
    });

    const basePrice = latestPrice ? Number(latestPrice.price) : 0;

    // Get all active promotions for this product
    const activePromotions = await Promotion.findAll({
      where: getActivePromotionConditions(),
      include: [{
        model: Product,
        as: 'products',
        where: { id: product.id },
        required: true,
        through: { attributes: [] }
      }],
      order: [['created_at', 'DESC']]
    });

    let discountedPrice = basePrice;
    let discountAmount = 0;
    let appliedPromotion = null;

    if (activePromotions.length > 0) {
      const promotion = activePromotions[0];
      if (promotion.type === 'PERCENTAGE') {
        discountAmount = (basePrice * promotion.discount) / 100;
      } else {
        discountAmount = promotion.discount;
      }
      discountedPrice = Math.max(0, basePrice - discountAmount);

      appliedPromotion = {
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
        discount: promotion.discount,
        start_date: promotion.start_date,
        end_date: promotion.end_date
      };
    }

    res.json({
      product_id: product.id,
      base_price: basePrice,
      discounted_price: discountedPrice,
      discount_amount: discountAmount,
      has_discount: discountAmount > 0,
      applied_promotion: appliedPromotion,
      all_active_promotions: activePromotions.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        discount: p.discount
      }))
    });

  } catch (error) {
    console.error('Error getting product prices:', error);
    res.status(500).json({ error: 'Failed to get product prices' });
  }
});

export default router;