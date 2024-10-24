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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use routes
app.use('/', routes);

app.get('/', (req, res) => {
  res.json({ message: 'Batericars API is running!' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
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