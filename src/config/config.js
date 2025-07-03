const dotenv = require('dotenv');
const path = require('path');
// const mongoose = require('mongoose');

const environment = process.env.NODE_ENV || 'dev';

const envFilePath = path.resolve(__dirname, `../../.env.${environment}`);

dotenv.config({ path: envFilePath });

const {
  // DB_USER,
  // DB_PWD,
  // DB_NAME,
  // DB_HOST,
  // DB_PORT,
  MONGO_URI,
  // AZURE_STORAGE_ACCOUNT_KEY,
  // AZURE_STORAGE_ACCOUNT_NAME,
  // CLOUDFRONT_URL,
} = process.env;

module.exports = {
  development: {
    // uri: `mongodb://${DB_HOST}:${DB_PORT}/${DB_NAME}`
    uri: `${MONGO_URI}`,
    //cloudfront_uri:`${CLOUDFRONT_URL}`,
  },
};
