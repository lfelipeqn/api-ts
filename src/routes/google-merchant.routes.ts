// src/routes/google-merchant.routes.ts

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { GoogleMerchantService } from '../services/GoogleMerchantService';
import { Product } from '../models/Product';

const router = Router();

// Protect all routes with authentication
router.use(authMiddleware);

// Upload all products to Google Merchant Center
router.post('/upload-all', async (req: AuthenticatedRequest, res) => {
  try {
    const merchantService = GoogleMerchantService.getInstance();
    const result = await merchantService.uploadAllProducts();

    res.json({
      status: 'success',
      data: {
        uploaded: result.success,
        failed: result.failed,
        errors: result.errors
      }
    });
  } catch (error) {
    console.error('Error uploading products to Google Merchant:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to upload products'
    });
  }
});

// Sync inventory and prices for all products
router.post('/sync', async (req: AuthenticatedRequest, res) => {
  try {
    const merchantService = GoogleMerchantService.getInstance();
    const result = await merchantService.syncInventoryAndPrices();

    res.json({
      status: 'success',
      data: {
        updated: result.success,
        failed: result.failed,
        errors: result.errors
      }
    });
  } catch (error) {
    console.error('Error syncing with Google Merchant:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to sync with Google Merchant'
    });
  }
});

// Upload a single product
router.post('/products/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    const merchantService = GoogleMerchantService.getInstance();
    await merchantService.uploadProduct(product);

    res.json({
      status: 'success',
      message: `Product ${product.id} uploaded successfully`
    });
  } catch (error) {
    console.error('Error uploading product:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to upload product'
    });
  }
});

// Delete a product from Google Merchant Center
router.delete('/products/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    const merchantService = GoogleMerchantService.getInstance();
    await merchantService.deleteProduct(productId);

    res.json({
      status: 'success',
      message: `Product ${productId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to delete product'
    });
  }
});

export default router;