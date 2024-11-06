// src/routes/payment-config.routes.ts

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { 
  PAYMENT_METHOD_TYPES, 
  PAYMENT_GATEWAYS, 
  GatewayConfigData,
  GatewayConfigAttributes
} from '../types/payment';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { GatewayConfig } from '../models/GatewayConfig';
import { Transaction, Sequelize } from 'sequelize';
import { getSequelize } from '../config/database';
import { PaymentGatewayService } from '../services/PaymentGatewayService';

const router = Router();
const gatewayService = PaymentGatewayService.getInstance();

router.use(authMiddleware);

// Validation schemas
const gatewayConfigSchema = z.object({
  gateway: z.enum(PAYMENT_GATEWAYS),
  name: z.string().min(1),
  config: z.record(z.any()),
  is_active: z.boolean().optional(),
  test_mode: z.boolean().optional()
});

const paymentMethodSchema = z.object({
  type: z.enum(PAYMENT_METHOD_TYPES),
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
  payment_gateway: z.enum(PAYMENT_GATEWAYS),
  gateway_config_id: z.number()
});

interface PaymentMethodUpdateData {
  type?: typeof PAYMENT_METHOD_TYPES[number];
  name?: string;
  description?: string | null;
  enabled?: boolean;
  min_amount?: number | null;
  max_amount?: number | null;
  payment_gateway?: typeof PAYMENT_GATEWAYS[number];
  gateway_config_id?: number;
}

interface StoredGouConfig {
  api_key: string;
  api_secret: string;
  endpoint: string;
  webhook_url?: string;
}

interface MaskedConfig {
  api_key?: string;
  api_secret?: string;
  endpoint?: string;
  webhook_url?: string;
  private_key?: string;
  [key: string]: any;
}

class PaymentMethodError extends Error {
    constructor(
      message: string,
      public statusCode: number = 400
    ) {
      super(message);
      this.name = 'PaymentMethodError';
    }
}

// Add validation schema for payment request
const paymentRequestSchema = z.object({
  type: z.enum(['CREDIT_CARD', 'PSE']),
  reference: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  // Credit Card fields
  cardNumber: z.string().optional(),
  cardExpiration: z.string().optional(),
  cvv: z.string().optional(),
  installments: z.string().optional(),
  // PSE fields
  bankCode: z.string().optional(),
  bankName: z.string().optional(),
  accountType: z.string().optional(),
  accountNumber: z.string().optional(),
  // Payer information
  payer: z.object({
    name: z.string(),
    surname: z.string(),
    email: z.string().email(),
    documentType: z.string(),
    document: z.string(),
    mobile: z.string().optional()
  })
});

// Middleware to validate request body
const validateRequest = (schema: z.ZodSchema) => async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await schema.parseAsync(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
      return;
    }
    next(error);
  }
};

// Helper function to handle transactions
const withTransaction = async <T>(
    sequelize: Sequelize,
    callback: (t: Transaction) => Promise<T>
  ): Promise<T> => {
    let transaction: Transaction | null = null;
    try {
      transaction = await sequelize.transaction();
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  };

  router.get('/gateways', async (req, res) => {
    try {
      const gateways = await GatewayConfig.findAll({
        order: [['name', 'ASC']]
      });
  
      const maskedGateways = gateways.map(gateway => {
        const config = gateway.getConfig();
        const maskedConfig: MaskedConfig = {
          ...config,
          api_key: config.api_key ? '********' : undefined,
          api_secret: config.api_secret ? '********' : undefined,
          private_key: config.private_key ? '********' : undefined
        };
  
        return {
          id: gateway.id,
          gateway: gateway.gateway,
          name: gateway.name,
          config: maskedConfig,
          is_active: gateway.is_active,
          test_mode: gateway.test_mode,
          created_at: gateway.created_at,
          updated_at: gateway.updated_at
        };
      });
  
      res.json({
        status: 'success',
        data: maskedGateways
      });
    } catch (error) {
      console.error('Error fetching gateway configs:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch gateway configurations'
      });
    }
  });

  router.post('/gateways', validateRequest(gatewayConfigSchema), async (req, res) => {
    try {
      const sequelize = getSequelize();
      const gateway = await withTransaction(sequelize, async (transaction) => {
        // Convert config object to JSON string before creating
        const data = {
          gateway: req.body.gateway,
          name: req.body.name,
          config: JSON.stringify(req.body.config), // Explicitly stringify the config
          is_active: req.body.is_active ?? false,
          test_mode: req.body.test_mode ?? true
        };
  
        const newGateway = await GatewayConfig.create(data, { transaction });
        return newGateway;
      });
  
      // Get config as object for response
      const config = gateway.getConfig();
      const maskedConfig = {
        ...config,
        api_key: config.api_key ? '********' : undefined,
        api_secret: config.api_secret ? '********' : undefined,
        private_key: config.private_key ? '********' : undefined
      };
  
      res.status(201).json({
        status: 'success',
        data: {
          id: gateway.id,
          gateway: gateway.gateway,
          name: gateway.name,
          config: maskedConfig,
          is_active: gateway.is_active,
          test_mode: gateway.test_mode,
          created_at: gateway.created_at,
          updated_at: gateway.updated_at
        }
      });
    } catch (error) {
      console.error('Error creating gateway config:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create gateway configuration',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

router.get('/gateways/:id', async (req, res) => {
  try {
    const gateway = await GatewayConfig.findByPk(req.params.id);
    if (!gateway) {
      return res.status(404).json({
        status: 'error',
        message: 'Gateway configuration not found'
      });
    }

    const config = gateway.getConfig();
    const maskedConfig: MaskedConfig = {
      ...config,
      api_key: '********',
      api_secret: '********',
      private_key: '********'
    };

    res.json({
      status: 'success',
      data: {
        ...gateway.toJSON(),
        config: maskedConfig
      }
    });
  } catch (error) {
    console.error('Error fetching gateway config:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch gateway configuration'
    });
  }
});
/** 
router.patch('/gateways/:id', async (req, res) => {
  try {
    const sequelize = getSequelize();
    const result = await withTransaction(sequelize, async (transaction) => {
      const gateway = await GatewayConfig.findByPk(req.params.id, { transaction });
      if (!gateway) {
        throw new Error('Gateway configuration not found');
      }

      // Get current config
      const currentConfig: GatewayConfigData = gateway.getConfigObject();

      // Create update object only with provided fields
      const updateData: Partial<GatewayConfigAttributes> = {};

      // Handle basic fields if provided
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.gateway !== undefined) updateData.gateway = req.body.gateway;
      if (req.body.is_active !== undefined) updateData.is_active = req.body.is_active;
      if (req.body.test_mode !== undefined) updateData.test_mode = req.body.test_mode;

      // Handle config updates if provided
      if (req.body.config) {
        // Merge only the provided config fields with current config
        const newConfig: GatewayConfigData = {
          ...currentConfig,
          ...Object.entries(req.body.config).reduce((acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = value;
            }
            return acc;
          }, {} as GatewayConfigData)
        };
        updateData.config = JSON.stringify(newConfig);
      }

      // Update only if there are changes
      if (Object.keys(updateData).length > 0) {
        await gateway.update(updateData, { transaction });
      }

      // Fetch the updated gateway
      const updatedGateway = await GatewayConfig.findByPk(gateway.id, { transaction });
      if (!updatedGateway) {
        throw new Error('Failed to retrieve updated gateway');
      }

      return updatedGateway;
    });

    // Get the config as a proper object
    const config: GatewayConfigData = result.getConfigObject();

    // Create masked configuration
    const maskedConfig: GatewayConfigData = {
      ...config,
      api_key: config.api_key ? '********' : undefined,
      api_secret: config.api_secret ? '********' : undefined,
      private_key: config.private_key ? '********' : undefined
    };

    // Send response
    res.json({
      status: 'success',
      data: {
        id: result.id,
        gateway: result.gateway,
        name: result.name,
        config: maskedConfig,
        is_active: result.is_active,
        test_mode: result.test_mode,
        created_at: result.created_at,
        updated_at: result.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating gateway config:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to update gateway configuration'
    });
  }
});*/

// Payment Method Routes
router.get('/payment-methods', async (req, res) => {
  try {
    const methods = await PaymentMethodConfig.findAll({
      include: [{
        model: GatewayConfig,
        as: 'gatewayConfig',
        attributes: ['id', 'name', 'gateway', 'is_active']
      }],
      order: [['name', 'ASC']]
    });

    res.json({
      status: 'success',
      data: methods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment methods'
    });
  }
});

router.post('/payment-methods', validateRequest(paymentMethodSchema), async (req, res) => {
  try {
    const sequelize = getSequelize();
    const method = await withTransaction(sequelize, async (transaction) => {
      const gateway = await GatewayConfig.findByPk(req.body.gateway_config_id, { transaction });
      if (!gateway || !gateway.is_active) {
        throw new Error('Invalid or inactive gateway configuration');
      }
      return await PaymentMethodConfig.create(req.body, { transaction });
    });

    res.status(201).json({
      status: 'success',
      data: method
    });
  } catch (error) {
    console.error('Error creating payment method:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create payment method'
    });
  }
});

router.get('/payment-methods/:id', async (req, res) => {

    try {
      const sequelize = getSequelize();
      const method = await withTransaction(sequelize, async (transaction) => {
        // Find payment method with its gateway configuration
        const paymentMethod = await PaymentMethodConfig.findByPk(req.params.id, {
          include: [{
            model: GatewayConfig,
            as: 'gatewayConfig',
            attributes: ['id', 'name', 'gateway', 'is_active']
          }],
          transaction
        });

        if (!paymentMethod) {
          throw new PaymentMethodError('Payment method not found', 404);
        }

        return paymentMethod;
      });

      // Format the response
      const response = {
        status: 'success',
        data: {
          id: method.id,
          type: method.type,
          name: method.name,
          description: method.description,
          enabled: method.enabled,
          min_amount: method.min_amount,
          max_amount: method.max_amount,
          payment_gateway: method.payment_gateway,
          gateway_config_id: method.gateway_config_id,
          gateway_config: method.gatewayConfig ? {
            id: method.gatewayConfig.id,
            name: method.gatewayConfig.name,
            gateway: method.gatewayConfig.gateway,
            is_active: method.gatewayConfig.is_active
          } : null,
          created_at: method.created_at,
          updated_at: method.updated_at
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Error fetching payment method:', error);

      if (error instanceof PaymentMethodError) {
        return res.status(error.statusCode).json({
          status: 'error',
          message: error.message
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch payment method'
      });
    }
});

router.patch('/payment-methods/:id', async (req, res) => {
  try {
    const sequelize = getSequelize();
    const updatedMethod = await withTransaction(sequelize, async (transaction) => {
      // Find the payment method with its gateway config
      const method = await PaymentMethodConfig.findByPk(req.params.id, {
        transaction,
        include: [{
          model: GatewayConfig,
          as: 'gatewayConfig',
          attributes: ['id', 'name', 'gateway', 'is_active']
        }]
      });

      if (!method) {
        throw new PaymentMethodError('Payment method not found', 404);
      }

      // Create update object only with provided fields
      const updateData: PaymentMethodUpdateData = {};

      // Handle basic fields if provided
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.type !== undefined) updateData.type = req.body.type;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.enabled !== undefined) updateData.enabled = req.body.enabled;
      if (req.body.min_amount !== undefined) updateData.min_amount = req.body.min_amount;
      if (req.body.max_amount !== undefined) updateData.max_amount = req.body.max_amount;

      // Handle gateway-related updates
      if (req.body.payment_gateway !== undefined || req.body.gateway_config_id !== undefined) {
        if (req.body.gateway_config_id) {
          const gateway = await GatewayConfig.findByPk(req.body.gateway_config_id, {
            transaction
          });

          if (!gateway) {
            throw new PaymentMethodError('Gateway configuration not found');
          }

          if (!gateway.is_active) {
            throw new PaymentMethodError('Gateway configuration is not active');
          }

          if (req.body.payment_gateway && req.body.payment_gateway !== gateway.gateway) {
            throw new PaymentMethodError('Payment gateway does not match the configured gateway');
          }

          updateData.gateway_config_id = gateway.id;
          updateData.payment_gateway = gateway.gateway;
        }
      }

      // Validate amount ranges
      const newMinAmount = updateData.min_amount ?? method.min_amount;
      const newMaxAmount = updateData.max_amount ?? method.max_amount;

      if (newMinAmount !== null && newMaxAmount !== null) {
        if (newMinAmount > newMaxAmount) {
          throw new PaymentMethodError('Minimum amount cannot be greater than maximum amount');
        }
      }

      // Update only if there are changes
      if (Object.keys(updateData).length > 0) {
        await method.update(updateData as any, { transaction });

        // Reload the method with its associations
        await method.reload({
          transaction,
          include: [{
            model: GatewayConfig,
            as: 'gatewayConfig',
            attributes: ['id', 'name', 'gateway', 'is_active']
          }]
        });
      }

      return method;
    });

    // Format the response
    res.json({
      status: 'success',
      data: {
        id: updatedMethod.id,
        type: updatedMethod.type,
        name: updatedMethod.name,
        description: updatedMethod.description,
        enabled: updatedMethod.enabled,
        min_amount: updatedMethod.min_amount,
        max_amount: updatedMethod.max_amount,
        payment_gateway: updatedMethod.payment_gateway,
        gateway_config_id: updatedMethod.gateway_config_id,
        gateway_config: updatedMethod.gatewayConfig ? {
          id: updatedMethod.gatewayConfig.id,
          name: updatedMethod.gatewayConfig.name,
          gateway: updatedMethod.gatewayConfig.gateway,
          is_active: updatedMethod.gatewayConfig.is_active
        } : null,
        created_at: updatedMethod.created_at,
        updated_at: updatedMethod.updated_at
      }
    });

  } catch (error) {
    console.error('Error updating payment method:', error);

    if (error instanceof PaymentMethodError) {
      return res.status(error.statusCode).json({
        status: 'error',
        message: error.message
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to update payment method'
    });
  }
});

export default router;