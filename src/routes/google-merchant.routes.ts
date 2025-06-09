// src/routes/google-merchant.routes.ts

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { GoogleMerchantService } from '../services/GoogleMerchantService';
import { Product } from '../models/Product';
import { Cache } from '../services/Cache';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Protect all routes with authentication
router.use(authMiddleware);

// Upload all products to Google Merchant Center
router.post('/upload-all', async (req: AuthenticatedRequest, res) => {
  try {
    const uploadId = uuidv4();
    const merchantService = GoogleMerchantService.getInstance();
    
    // Send initial response with upload ID for tracking
    res.json({
      status: 'success',
      message: 'Upload process started',
      data: {
        uploadId,
        started_at: new Date().toISOString(),
        status: 'processing'
      }
    });

    // Start upload process in background
    merchantService.uploadAllProducts(
      progress => {
        console.log(`Upload progress: ${progress.current}/${progress.total} products processed`);
      },
      uploadId
    ).then(result => {
      console.log('Upload completed:', result);
    }).catch(error => {
      console.error('Background upload error:', error);
    });
  } catch (error) {
    console.error('Error starting upload:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to start upload'
    });
  }
});

// Sync inventory and prices for all products
router.post('/sync', async (req: AuthenticatedRequest, res) => {
  // Send initial response quickly
  res.json({
    status: 'success',
    message: 'Sync process started',
    data: {
      started_at: new Date().toISOString(),
      status: 'processing'
    }
  });

  // Continue processing in background
  try {
    const merchantService = GoogleMerchantService.getInstance();
    const cache = Cache.getInstance();
    
    const result = await merchantService.syncInventoryAndPrices(progress => {
      console.log(`Sync progress: ${progress.current}/${progress.total} products processed`);
    });

    await Promise.all([
      cache.clearPattern('product:*'),
      cache.clearPattern('category:*'),
      cache.clearPattern('product-line:*')
    ]);

    console.log('Sync completed:', result);
  } catch (error) {
    console.error('Background sync error:', error);
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

// Get upload progress
router.get('/upload-progress/:uploadId', async (req: AuthenticatedRequest, res) => {
  try {
    const { uploadId } = req.params;
    const merchantService = GoogleMerchantService.getInstance();
    const progress = await merchantService.getUploadProgress(uploadId);
    
    if (!progress) {
      return res.status(404).json({
        status: 'error',
        message: 'Upload progress not found'
      });
    }
    
    res.json({
      status: 'success',
      data: progress
    });
  } catch (error) {
    console.error('Error getting upload progress:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get upload progress'
    });
  }
});

// Cancel upload
router.post('/upload-cancel/:uploadId', async (req: AuthenticatedRequest, res) => {
  try {
    const { uploadId } = req.params;
    const merchantService = GoogleMerchantService.getInstance();
    const cancelled = await merchantService.cancelUpload(uploadId);
    
    if (!cancelled) {
      return res.status(404).json({
        status: 'error',
        message: 'Upload not found or cannot be cancelled'
      });
    }
    
    res.json({
      status: 'success',
      message: 'Upload cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling upload:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to cancel upload'
    });
  }
});

// Get all active uploads
router.get('/uploads', async (req: AuthenticatedRequest, res) => {
  try {
    const merchantService = GoogleMerchantService.getInstance();
    const uploads = await merchantService.getAllActiveUploads();
    
    res.json({
      status: 'success',
      data: uploads
    });
  } catch (error) {
    console.error('Error getting active uploads:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get active uploads'
    });
  }
});

export default router;