import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAdminRole } from '../middleware/admin.middleware';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { UserSessionManager } from '../services/UserSessionManager';
import { PermissionService } from '../services/PermissionService';
import { Order } from '../models/Order';
import { Payment } from '../models/Payment';
import { PaymentMethodConfig } from '../models/PaymentMethodConfig';
import { Address } from '../models/Address';
import { Agency } from '../models/Agency';
import { City } from '../models/City';
import { Department } from '../models/Department';
import { Op } from 'sequelize';

const router = Router();

// Validation schemas
const ordersQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
  state: z.string().optional(),
  query: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.string().optional().default('created_at'),
  order: z.enum(['ASC', 'DESC']).optional().default('DESC')
});

// Middleware to check specific order permissions
const checkOrderPermission = (permission: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      const permissionService = PermissionService.getInstance();
      const userPermissions = await permissionService.getUserPermissions(req.user);
      
      const hasPermission = userPermissions.includes(permission) || 
                           userPermissions.includes('order.manage');
      
      // Special case for view_own permission
      if (permission === 'order.view' && !hasPermission) {
        if (userPermissions.includes('order.view_own')) {
          req.viewOwnOnly = true;
          return next();
        }
      }
      
      if (!hasPermission) {
        return res.status(403).json({
          status: 'error',
          message: `Permission denied: ${permission} required`
        });
      }
      
      next();
    } catch (error) {
      console.error(`Permission check error (${permission}):`, error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to validate permissions'
      });
    }
  };
};

// Example of an admin-only route
router.get('/dashboard-stats', authMiddleware, requireAdminRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Example admin dashboard route
    // Fetch dashboard statistics
    
    res.json({
      status: 'success',
      data: {
        // Admin dashboard data
        userCount: 0, // Replace with actual count
        orderCount: 0, // Replace with actual count
        // Add more stats as needed
      }
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching dashboard statistics'
    });
  }
});

/**
 * @route GET /api/admin/orders
 * @desc Get all orders with pagination and filtering
 * @access Admin only - requires order.view or order.view_own permission
 */
router.get('/orders', 
  authMiddleware, 
  requireAdminRole,
  checkOrderPermission('order.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { 
        page, 
        limit, 
        state, 
        query, 
        startDate, 
        endDate,
        sortBy,
        order: sortOrder 
      } = ordersQuerySchema.parse(req.query);
      
      const offset = (page - 1) * limit;
      
      // Build where clause based on filters
      const where: any = {};
      
      // If user only has view_own permission, restrict to their orders
      if (req.viewOwnOnly) {
        where.user_id = req.user!.id;
      }
      
      // Apply other filters
      if (state) {
        where.state = state;
      }
      
      if (query) {
        where[Op.or] = [
          { id: isNaN(parseInt(query)) ? 0 : parseInt(query) },
          { '$user.email$': { [Op.like]: `%${query}%` } },
          { '$user.person.first_name$': { [Op.like]: `%${query}%` } },
          { '$user.person.last_name$': { [Op.like]: `%${query}%` } }
        ];
      }
      
      if (startDate && endDate) {
        where.created_at = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else if (startDate) {
        where.created_at = {
          [Op.gte]: new Date(startDate)
        };
      } else if (endDate) {
        where.created_at = {
          [Op.lte]: new Date(endDate)
        };
      }
      
      // Get orders with pagination and include relevant associations
      const { count, rows: orders } = await Order.findAndCountAll({
        where,
        limit,
        offset,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'email'],
            include: [
              {
                association: 'person',
                attributes: ['first_name', 'last_name']
              }
            ]
          },
          {
            model: Payment,
            as: 'lastPayment',
            attributes: ['id', 'state', 'state_description', 'created_at']
          },
          {
            model: PaymentMethodConfig,
            as: 'paymentMethod',
            attributes: ['id', 'name', 'type']
          },
          {
            model: Address,
            as: 'deliveryAddress',
            include: [{
              model: City,
              as: 'city',
              include: [{
                model: Department,
                as: 'department'
              }]
            }]
          },
          {
            model: Agency,
            as: 'pickupAgency',
            attributes: ['id', 'magister_cellar', 'document_prefix', 'number']
          }
        ],
        order: [[sortBy, sortOrder]]
      });
      
      // Format the response
      const formattedOrders = orders.map(order => ({
        id: order.id,
        state: order.state,
        delivery_type: order.delivery_type,
        total_amount: Number(order.total_amount),
        subtotal_amount: Number(order.subtotal_amount),
        shipping_amount: Number(order.shipping_amount),
        discount_amount: Number(order.discount_amount),
        tax_amount: Number(order.tax_amount),
        created_at: order.created_at,
        updated_at: order.updated_at,
        customer: order.user ? {
          id: order.user.id,
          email: order.user.email,
          name: order.user.person ? 
            `${order.user.person.first_name} ${order.user.person.last_name}` : 
            'Unknown'
        } : null,
        payment: order.lastPayment ? {
          id: order.lastPayment.id,
          state: order.lastPayment.state,
          description: order.lastPayment.state_description,
          date: order.lastPayment.created_at
        } : null,
        payment_method: order.paymentMethod ? {
          id: order.paymentMethod.id,
          name: order.paymentMethod.name,
          type: order.paymentMethod.type
        } : null,
        delivery_info: order.delivery_type === 'SHIPPING' ? {
          address: order.deliveryAddress ? {
            id: order.deliveryAddress.id,
            detail: order.deliveryAddress.detail,
            city: order.deliveryAddress.city?.name,
            department: order.deliveryAddress.city?.department?.name
          } : null
        } : {
          agency: order.pickupAgency ? {
            id: order.pickupAgency.id,
            name: order.pickupAgency.magister_cellar,
            reference: `${order.pickupAgency.document_prefix}-${order.pickupAgency.number}`
          } : null
        }
      }));
      
      res.json({
        status: 'success',
        data: formattedOrders,
        meta: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
      
    } catch (error) {
      console.error('Error fetching orders:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid query parameters',
          errors: error.errors
        });
      }
      
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch orders'
      });
    }
  }
);

/**
 * @route GET /api/admin/orders/:id
 * @desc Get order details by ID
 * @access Admin only - requires order.view or order.view_own permission
 */
router.get('/orders/:id', 
  authMiddleware, 
  requireAdminRole,
  checkOrderPermission('order.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orderId = parseInt(req.params.id);
      
      if (isNaN(orderId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid order ID'
        });
      }
      
      // Build where clause
      const where: any = { id: orderId };
      
      // If user only has view_own permission, restrict to their orders
      if (req.viewOwnOnly) {
        where.user_id = req.user!.id;
      }
      
      // Get order with all details
      const order = await Order.findOne({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'email'],
            include: [
              {
                association: 'person',
                attributes: ['first_name', 'last_name', 'cell_phone_1']
              }
            ]
          },
          {
            model: Payment,
            as: 'lastPayment',
            attributes: ['id', 'state', 'state_description', 'created_at']
          },
          {
            model: PaymentMethodConfig,
            as: 'paymentMethod',
            attributes: ['id', 'name', 'type']
          },
          {
            model: Address,
            as: 'deliveryAddress',
            include: [{
              model: City,
              as: 'city',
              include: [{
                model: Department,
                as: 'department'
              }]
            }]
          },
          {
            model: Agency,
            as: 'pickupAgency',
            include: [{
              model: Address,
              as: 'address',
              include: [{
                model: City,
                as: 'city'
              }]
            }]
          }
        ]
      });
      
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }
      
      // Get order items
      const orderSummary = await order.getOrderSummary();
      
      // Format response
      const response = {
        id: order.id,
        state: order.state,
        delivery_type: order.delivery_type,
        amounts: {
          subtotal: Number(order.subtotal_amount),
          shipping: Number(order.shipping_amount),
          discount: Number(order.discount_amount),
          tax: Number(order.tax_amount),
          total: Number(order.total_amount)
        },
        customer: order.user ? {
          id: order.user.id,
          email: order.user.email,
          name: order.user.person ? 
            `${order.user.person.first_name} ${order.user.person.last_name}` : 
            'Unknown',
          phone: order.user.person?.cell_phone_1
        } : null,
        payment: order.lastPayment ? {
          id: order.lastPayment.id,
          state: order.lastPayment.state,
          description: order.lastPayment.state_description,
          date: order.lastPayment.created_at
        } : null,
        payment_method: order.paymentMethod ? {
          id: order.paymentMethod.id,
          name: order.paymentMethod.name,
          type: order.paymentMethod.type
        } : null,
        delivery_info: order.delivery_type === 'SHIPPING' ? {
          address: order.deliveryAddress ? {
            id: order.deliveryAddress.id,
            detail: order.deliveryAddress.detail,
            city: order.deliveryAddress.city?.name,
            department: order.deliveryAddress.city?.department?.name
          } : null
        } : {
          agency: order.pickupAgency ? {
            id: order.pickupAgency.id,
            name: order.pickupAgency.magister_cellar,
            location: order.pickupAgency.address ? {
              detail: order.pickupAgency.address.detail,
              city: order.pickupAgency.address.city?.name
            } : null
          } : null
        },
        created_at: order.created_at,
        updated_at: order.updated_at,
        items: orderSummary.items
      };
      
      res.json({
        status: 'success',
        data: response
      });
      
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch order details'
      });
    }
  }
);

/**
 * @route PUT /api/admin/orders/:id/state
 * @desc Update order state
 * @access Admin only - requires order.update permission
 */
router.put('/orders/:id/state', 
  authMiddleware, 
  requireAdminRole,
  checkOrderPermission('order.update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orderId = parseInt(req.params.id);
      const { state } = req.body;
      
      if (!state) {
        return res.status(400).json({
          status: 'error',
          message: 'State is required'
        });
      }
      
      const order = await Order.findByPk(orderId);
      
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }
      
      // Update order state
      await order.update({ state });
      
      res.json({
        status: 'success',
        message: 'Order state updated successfully',
        data: {
          id: order.id,
          state: order.state
        }
      });
      
    } catch (error) {
      console.error('Error updating order state:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update order state'
      });
    }
  }
);

/**
 * @route PUT /api/admin/orders/:id/cancel
 * @desc Cancel an order
 * @access Admin only - requires order.cancel permission
 */
router.put('/orders/:id/cancel', 
  authMiddleware, 
  requireAdminRole,
  checkOrderPermission('order.cancel'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orderId = parseInt(req.params.id);
      const { reason } = req.body;
      
      const order = await Order.findByPk(orderId);
      
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }
      
      // Check if order can be cancelled
      if (['CANCELLED', 'COMPLETED', 'DELIVERED'].includes(order.state)) {
        return res.status(400).json({
          status: 'error',
          message: `Cannot cancel an order in ${order.state} state`
        });
      }
      
      // Cancel the order
      await order.update({ 
        state: 'CANCELLED',
        notes: reason || 'Cancelled by administrator'
      });
      
      res.json({
        status: 'success',
        message: 'Order cancelled successfully',
        data: {
          id: order.id,
          state: order.state,
          notes: order.notes
        }
      });
      
    } catch (error) {
      console.error('Error cancelling order:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to cancel order'
      });
    }
  }
);

export default router;