// routes/payment-test.routes.ts

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { PaymentGateway } from '../types/payment';
import { Response } from 'express';

const router = Router();

// Middleware to require authentication for all routes
router.use(authMiddleware);

/**
 * Test payment gateway connection
 * @route POST /api/payments/test-connection/:gateway
 */
router.post('/test-connection/:gateway', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = req.params.gateway.toUpperCase() as PaymentGateway;
    const gatewayService = PaymentGatewayService.getInstance();

    // Get IP address from request
    const ipAddress = req.headers['x-forwarded-for']?.toString() || 
                     req.socket.remoteAddress || 
                     '127.0.0.1';

    // Get user agent
    const userAgent = req.headers['user-agent'] || 'Test Client';

    console.log('Testing gateway connection:', {
      gateway,
      ipAddress,
      userAgent,
      userId: req.user?.id
    });

    const paymentGateway = await gatewayService.getGateway(gateway);
    
    const testResult = await paymentGateway.testConnection();

    res.json({
      status: 'success',
      data: {
        gateway,
        testResult,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Gateway test connection error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to test gateway connection',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get detailed gateway information
 * @route GET /api/payments/gateway-info/:gateway
 */
router.get('/gateway-info/:gateway', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateway = req.params.gateway.toUpperCase() as PaymentGateway;
    const gatewayService = PaymentGatewayService.getInstance();
    
    const paymentGateway = await gatewayService.getGateway(gateway);
    const gatewayInfo = paymentGateway.getGatewayInfo();

    res.json({
      status: 'success',
      data: {
        gateway,
        info: gatewayInfo,
        testMode: gatewayInfo.test_mode
      }
    });

  } catch (error) {
    console.error('Error getting gateway info:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to get gateway information'
    });
  }
});

/**
 * Test single endpoint for all active gateways
 * @route POST /api/payments/test-all-gateways
 */
router.post('/test-all-gateways', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gatewayService = PaymentGatewayService.getInstance();
    const results = new Map<PaymentGateway, any>();
    const errors = new Map<PaymentGateway, string>();

    // Get all active gateways
    const activeGateways = await gatewayService.getAllActiveGateways();

    // Test each gateway in parallel
    const testPromises = activeGateways.map(async (gateway) => {
      try {
        const testResult = await gateway.testConnection();
        results.set(gateway.getGatewayInfo().provider as PaymentGateway, testResult);
      } catch (error) {
        errors.set(
          gateway.getGatewayInfo().provider as PaymentGateway, 
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    });

    await Promise.all(testPromises);

    res.json({
      status: 'success',
      data: {
        results: Object.fromEntries(results),
        errors: Object.fromEntries(errors),
        timestamp: new Date().toISOString(),
        total_gateways: activeGateways.length,
        successful_tests: results.size,
        failed_tests: errors.size
      }
    });

  } catch (error) {
    console.error('Error testing all gateways:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to test gateways'
    });
  }
});

export default router;