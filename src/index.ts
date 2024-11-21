// src/index.ts
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import routes from './routes/index';
import { connectRedis } from './routes/redis-routes';
import { getDatabase } from './config/database';
import { initializeCache } from './config/redis';

// Type for JSON parse error
interface JsonParseError extends SyntaxError {
  status?: number;
  statusCode?: number;
  body?: any;
  type?: string;
}

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Content-Type middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const contentType = req.header('Content-Type');
  if (contentType?.includes('application/json')) {
    req.headers['content-type'] = 'application/json';
  }
  next();
});

// Configure body parsers
app.use(express.json({
  limit: '10mb',
  strict: true
}));

app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// JSON error handling middleware
app.use((err: Error | JsonParseError, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && (err as JsonParseError).status === 400 && 'body' in err) {
    console.error('JSON Parse Error:', err);
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON format',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  next(err);
});

// CORS headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      console.log('Request debug info:', {
        method: req.method,
        path: req.path,
        contentType: req.header('Content-Type'),
        bodySize: req.body ? JSON.stringify(req.body).length : 0,
        body: req.body
      });
    }
    next();
  });
}

// Use routes
app.use('/', routes);

// Interface for custom API errors
interface ApiError extends Error {
  status?: number;
  statusCode?: number;
  details?: any;
}

// Global error handling middleware
app.use((err: ApiError, req: Request, res: Response, next: NextFunction) => {
  // Always log the error
  console.error('Global error handler:', {
    error: err,
    stack: err.stack
  });

  // Don't send multiple responses
  if (res.headersSent) {
    console.warn('Headers already sent, passing to default error handler');
    return next(err);
  }

  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Send error response
  return res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details || err
    })
  });
});

async function startServer() {
  try {
    const { sequelize } = getDatabase();
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');

    // Initialize Redis
    await connectRedis();
    await initializeCache();
    console.log('Redis connection has been established successfully.');

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to start the server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    const { sequelize } = getDatabase();
    await sequelize.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();

export default app;