import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { Address } from '../models/Address';
import { City } from '../models/City';
import { Department } from '../models/Department';
import { AddressType, ADDRESS_TYPES } from '../types/address';

const router = Router();

// Validation schemas
const addressSchema = z.object({
    name: z.string().optional(),
    neighborhood: z.string().optional(),
    detail: z.string().min(1, 'Address detail is required'),
    city_id: z.number().positive('City ID is required'),
    type: z.enum(ADDRESS_TYPES),
    number: z.string().optional(),
    is_default: z.boolean().optional().default(false)
  });
  

const updateAddressSchema = addressSchema.partial();

// Get all addresses for the authenticated user
router.get('/addresses', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const addresses = await Address.findAll({
      where: { user_id: req.user!.id },
      include: [{
        model: City,
        as: 'city',
        include: [{
          model: Department,
          as: 'department'
        }]
      }],
      order: [
        ['is_default', 'DESC'],
        ['created_at', 'DESC']
      ]
    });

    // Get count of addresses by type
    const addressCounts = await Address.getAddressCountByType(req.user!.id);

    res.json({
      status: 'success',
      data: addresses,
      meta: {
        total: addresses.length,
        counts_by_type: addressCounts
      }
    });
  } catch (error) {
    console.error('Error fetching addresses:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch addresses'
    });
  }
});

// Get a specific address
router.get('/addresses/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const address = await Address.findOne({
      where: { 
        id: req.params.id,
        user_id: req.user!.id 
      },
      include: [{
        model: City,
        as: 'city',
        include: [{
          model: Department,
          as: 'department'
        }]
      }]
    });

    if (!address) {
      return res.status(404).json({
        status: 'error',
        message: 'Address not found'
      });
    }

    res.json({
      status: 'success',
      data: address
    });
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch address'
    });
  }
});

// Create a new address
router.post('/addresses', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = addressSchema.parse(req.body);
    const userId = req.user!.id;

    const addressCount = await Address.count({
        where: { 
          user_id: userId,
          type: validatedData.type
        }
      });
  
      if (addressCount >= 5) {
        return res.status(400).json({
          status: 'error',
          message: `Maximum number of ${validatedData.type} addresses (5) reached`
        });
      }

    // Verify city exists and is enabled
    const city = await City.findByPk(validatedData.city_id);
    if (!city || !city.cityIsEnabled()) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or disabled city'
      });
    }

    const address = await Address.create({
        ...validatedData,
        user_id: userId,
        via: null,
        via_identification: null
      });

    // Get full address details with city and department
    const fullAddress = await Address.findOne({
        where: { id: address.id },
        include: [{
          model: City,
          as: 'city',
          include: [{
            model: Department,
            as: 'department'
          }]
        }]
      });
  
      res.status(201).json({
        status: 'success',
        data: fullAddress
      });
  } catch (error) {
    console.error('Error creating address:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
    }
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to create address'
    });
  }
});

// Update an address
router.put('/addresses/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const addressId = parseInt(req.params.id);
        const validatedData = addressSchema.parse(req.body);
    
        const address = await Address.findOne({
          where: { 
            id: addressId,
            user_id: req.user!.id
          }
        });
    
        if (!address) {
          return res.status(404).json({
            status: 'error',
            message: 'Address not found'
          });
        }
    
        // Update without via and via_identification
        await address.update({
          ...validatedData,
          via: null,
          via_identification: null
        });
    
        const updatedAddress = await Address.findOne({
          where: { id: address.id },
          include: [{
            model: City,
            as: 'city',
            include: [{
              model: Department,
              as: 'department'
            }]
          }]
        });
    
        res.json({
          status: 'success',
          data: updatedAddress
        });
    
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: error.errors
          });
        }
        console.error('Error updating address:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to update address'
        });
      }
});

// Delete an address
router.delete('/addresses/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const addressId = parseInt(req.params.id);
        const address = await Address.findOne({
          where: { 
            id: addressId,
            user_id: req.user!.id
          }
        });
    
        if (!address) {
          return res.status(404).json({
            status: 'error',
            message: 'Address not found'
          });
        }
    
        await address.destroy();
    
        res.json({
          status: 'success',
          message: 'Address deleted successfully'
        });
      } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to delete address'
        });
      }
});

// Set an address as default for its type
router.post('/addresses/:id/default', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const address = await Address.findOne({
      where: { 
        id: req.params.id,
        user_id: req.user!.id 
      }
    });

    if (!address) {
      return res.status(404).json({
        status: 'error',
        message: 'Address not found'
      });
    }

    await Address.setDefaultAddress(address.id, req.user!.id);

    // Reload with city and department info
    await address.reload({
      include: [{
        model: City,
        as: 'city',
        include: [{
          model: Department,
          as: 'department'
        }]
      }]
    });

    res.json({
      status: 'success',
      data: address
    });
  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to set default address'
    });
  }
});

export default router;