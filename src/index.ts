import express from 'express';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import routes, { connectRedis } from './routes';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const sequelize = new Sequelize(process.env.DATABASE_URL as string, {
  dialect: 'mysql',
});

app.use(express.json());

// Use routes
app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ message: 'Batericars API is running!' });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');

    await connectRedis();

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to start the server:', error);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  await sequelize.close();
  process.exit(0);
});