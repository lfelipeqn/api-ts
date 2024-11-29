import { Router } from 'express';
import { ProductLine } from '../models/ProductLine';
import { Brand } from '../models/Brand';
import { Op, Includeable } from 'sequelize';
import { getSequelize } from '../config/database';
import { Agency } from '../models/Agency';
import { Department } from '../models/Department';
import { City } from '../models/City';
import { Address } from '../models/Address';
import { File } from '../models/File';

const router = Router();
const sequelize = getSequelize();

// GET /api/categories - Get all active product lines (categories)
router.get('/categories', async (req, res) => {
  try {
    const categories = await ProductLine.findAll({
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    res.json({
      status: 'success',
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching categories'
    });
  }
});

// GET /api/categories/:id/brands - Get brands associated with a specific category
router.get('/categories/:id/brands', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);

    const brands = await Brand.findAll({
      include: [{
        model: ProductLine,
        as: 'productLines',
        where: { id: categoryId },
        attributes: [],
        through: {
          attributes: []
        }
      },
      {
        model: File,
        as: 'file',
        required: false
      }],
      attributes: ['id', 'name', 'file_id'],
      order: [['name', 'ASC']]
    });

    if (brands.length === 0) {
      return res.json({
        status: 'success',
        data: [],
        message: 'No brands found for this category'
      });
    }

    const brandsWithImages = await Promise.all(
      brands.map(brand => brand.toDetailedJSON())
    );

    res.json({
      status: 'success',
      data: brandsWithImages
    });
  } catch (error) {
    console.error('Error fetching brands for category:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching brands'
    });
  }
});

// GET /api/brands - Get all brands (optionally filtered by categoryId query parameter)
router.get('/brands', async (req, res) => {
  try {
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;

    const include: Includeable[] = [{
      model: File,
      as: 'file',
      required: false
    }];
    
    if (categoryId) {
      include.push({
        model: ProductLine,
        as: 'productLines',
        where: { id: categoryId },
        attributes: [],
        through: {
          attributes: []
        }
      });
    }

    const brands = await Brand.findAll({
      attributes: ['id', 'name', 'file_id'],
      include,
      order: [['name', 'ASC']]
    });

    const brandsWithImages = await Promise.all(
      brands.map(brand => brand.toDetailedJSON())
    );

    res.json({
      status: 'success',
      data: brandsWithImages,
      meta: {
        total: brands.length,
        filtered: categoryId ? true : false
      }
    });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching brands'
    });
  }
});

router.get('/agencies', async (req, res) => {
  try {
    const agencies = await Agency.findAll({
      where: {
        state: 'Activo'
      },
      include: [{
        model: Address,
        as: 'address',
        required: false,
        include: [{
          model: City,
          as: 'city',
          include: [{
            model: Department,
            as: 'department'
          }]
        }]
      }],
      attributes: [
        'id',
        'magister_cellar',
        'document_prefix',
        'number',
        'cell_phone_number',
        'business_hours'
      ],
      order: [
        ['magister_cellar', 'ASC']
      ]
    });

    // Convert the Sequelize model instances to plain objects
    const formattedAgencies = agencies.map(agency => {
      // First convert the Sequelize model to a plain object
      const data: any = agency.get({ plain: true });
      
      // Then create our formatted response object
      return {
        id: data.id,
        magister_cellar: data.magister_cellar,
        document_prefix: data.document_prefix,
        number: data.number,
        cell_phone_number: data.cell_phone_number,
        business_hours: data.business_hours,
        location: data.address && data.address.city ? {
          city: {
            id: data.address.city.id,
            name: data.address.city.name,
            department: data.address.city.department ? {
              id: data.address.city.department.id,
              name: data.address.city.department.name
            } : null
          }
        } : null
      };
    });

    res.json({
      status: 'success',
      data: formattedAgencies
    });
  } catch (error) {
    console.error('Error fetching agencies:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching agencies'
    });
  }
});

// GET /api/cities/agency-available - Get cities that have active agencies
router.get('/cities/agency-available', async (req, res) => {
  try {
    const cities = await City.findAll({
      include: [
        {
          model: Address,
          as: 'addresses',
          required: true,
          include: [{
            model: Agency,
            as: 'agency',
            required: true,
            where: { 
              state: 'Activo' 
            }
          }]
        },
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'name']
        }
      ],
      where: {
        enabled_for_orders: true
      },
      attributes: [
        'id',
        'name',
        'payment_against_delivery_enabled'
      ],
      order: [['name', 'ASC']]
    });

    const formattedCities = cities.map(city => {
      const plainCity = city.get({ plain: true });
      return {
        id: plainCity.id,
        name: plainCity.name,
        payment_against_delivery_enabled: plainCity.payment_against_delivery_enabled,
        department: plainCity.department ? {
          id: plainCity.department.id,
          name: plainCity.department.name
        } : null,
        agencies_count: plainCity.addresses?.length || 0
      };
    });

    res.json({
      status: 'success',
      data: formattedCities
    });
  } catch (error) {
    console.error('Error fetching cities with agencies:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching cities'
    });
  }
});

// GET /api/departments - Get all departments
router.get('/departments', async (req, res) => {
  try {
    const departments = await Department.findAll({
      where: {
        enabled_for_orders: true
      },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    res.json({
      status: 'success',
      data: departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching departments'
    });
  }
});

// GET /api/departments/:id/cities - Get cities by department
router.get('/departments/:id/cities', async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);

    const cities = await City.findAll({
      where: {
        department_id: departmentId,
        enabled_for_orders: true
      },
      attributes: [
        'id', 
        'name',
        'payment_against_delivery_enabled'
      ],
      order: [['name', 'ASC']]
    });

    res.json({
      status: 'success',
      data: cities,
      meta: {
        count: cities.length,
        department_id: departmentId
      }
    });
  } catch (error) {
    console.error('Error fetching cities for department:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error fetching cities'
    });
  }
});

export default router;