// src/routes/product.routes.ts

import { Router } from 'express';
import { Product } from '../models/Product';
import { DataSheet } from '../models/DataSheet';
import { DataSheetField } from '../models/DataSheetField';
import { DataSheetValue } from '../models/DataSheetValue';
import { Brand } from '../models/Brand';
import { ProductLine } from '../models/ProductLine';
import multer from 'multer';
import { Includeable, Op } from 'sequelize';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

router.get('/test', async (req, res) => {
    try {
      const count = await Product.count();
      res.json({ message: 'Product routes working', productCount: count });
    } catch (error:any) {
      console.error('Error in test route:', error);
      res.status(500).json({ error: 'Database error', message: error.message });
    }
});

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

    const results = await Product.searchWithCache(String(query), {
      limit: Number(limit),
      offset,
      brandId: brandId ? Number(brandId) : undefined,
      productLineId: productLineId ? Number(productLineId) : undefined
    });

    res.json({
      data: results.rows,
      meta: {
        total: results.count,
        page: Number(page),
        lastPage: Math.ceil(results.count / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get product details
// Update the get product route with better error handling and logging
router.get('/products/:id', async (req, res, next) => {
  try {
    console.log(`Fetching product with id: ${req.params.id}`);
    
    const includeOptions = [
      {
        model: DataSheet,
        as: 'dataSheets',
        required: false,
        include: [
          {
            model: DataSheetField,
            as: 'dataSheetFields',
            through: {
              model: DataSheetValue,
              as: 'DataSheetValue',
              attributes: ['value']
            }
          }
        ]
      },
      { 
        model: Brand, 
        as: 'brand' 
      },
      { 
        model: ProductLine, 
        as: 'productLine' 
      }
    ];

    const product = await Product.findByPk(req.params.id, {
      include: includeOptions,
      logging: console.log // To see the generated SQL query
    });

    if (!product) {
      console.log(`Product not found with id: ${req.params.id}`);
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log(`Found product: ${product.id}`);
    const productInfo = await product.getInfo();

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

// Upload product images
router.post('/products/:id/images', upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = await product.associateFiles(files, 0);
    res.json(uploadedFiles);
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ error: 'Failed to upload images' });
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

// Get product stock by agency
router.get('/products/:id/stock/:agencyId', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stock = await product.getStockByAgency(Number(req.params.agencyId));
    res.json({ stock });
  } catch (error) {
    console.error('Error getting stock:', error);
    res.status(500).json({ error: 'Failed to get stock' });
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

export default router;