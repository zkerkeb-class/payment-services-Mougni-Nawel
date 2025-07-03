const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const router = require('./routes/index.js');
const logger = require('./logger.js');
const config = require('./config/config.js')[process.env.NODE_ENV || 'development'];

dotenv.config();

const app = express();
const port = 8000;

// Database connection function
const connectDB = async () => {
  try {
    await mongoose.connect(config.uri);
    logger.log('MongoDB connected successfully');
  } catch (err) {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Application initialization function
const initializeApp = async () => {
  try {
    // Step 1: Connect to the database
    await connectDB();

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Initialization failed:', error);
  }
};

app.use(express.json());

app.use('/api', router);

const startServer = () => {
  initializeApp();

  // Start Express server
  app.listen(port, () => {
    logger.info(`Server running at http://localhost:${port}`);
  });
};

process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();
