// src/index.ts
import express from 'express';
import dotenv from 'dotenv';
import routes, { connectRedis } from './routes';
import { getDatabase } from './config/database';
import { initializeCache } from './config/redis';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Body parsing middleware
app.use((req, res, next) => {
  const contentType = req.header('Content-Type');
  if (contentType?.includes('application/json')) {
    req.headers['content-type'] = 'application/json';
  }
  next();
});

// Add CORS headers if needed
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
// Parse JSON bodies with debug logging
app.use(express.json({
  limit: '10mb',
  verify: (req: express.Request, res: express.Response, buf: Buffer) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      console.error('Invalid JSON:', e);
      res.status(400).json({ 
        status: 'error', 
        message: 'Invalid JSON in request body' 
      });
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// Request logging middleware
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Request debug info:', {
      method: req.method,
      path: req.path,
      contentType: req.header('Content-Type'),
      bodySize: JSON.stringify(req.body).length,
      body: req.body
    });
  }
  next();
});

// Use routes
app.use('/', routes);

app.get('/', (req, res) => {
  res.json({ message: 'Batericars API is running!' });
});

// Error handling middleware
// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error stack:', err.stack);
  
  // If headers have already been sent, delegate to default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON in request body',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Handle other errors
  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? {
      stack: err.stack,
      ...err
    } : undefined
  });
});

async function startServer() {
  try {
    const { sequelize, models } = getDatabase();
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

startServer();
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