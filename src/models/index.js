'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const process = require('process');
const logger = require('../utils/logger');

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.js')[env];

const db = {};
const mongoURI = config.uri;
const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info(`MongoDB connected successfully to ${mongoURI}`);
  } catch (err) {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

const modelFiles = fs.readdirSync(__dirname).filter((file) => {
  return (
    file.indexOf('.') !== 0 &&
    file !== basename &&
    file.slice(-3) === '.js' &&
    file.indexOf('.test.js') === -1
  );
});

modelFiles.forEach((file) => {
  const modelPath = path.join(__dirname, file);
  const model = require(modelPath)(mongoose);
  db[model.modelName] = model;
});

db.mongoose = mongoose;
connectDB();

module.exports = db;
