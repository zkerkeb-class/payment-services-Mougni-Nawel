const express = require('express');
const helmet = require('helmet');
const timeout = require('express-timeout-handler');
const mongoose = require('mongoose');
// const dotenv = require('dotenv');
const http = require('http');
const cors = require('cors');
// require('dotenv').config({ path: '../.env.dev' });
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.dev') });
const router = require('./routes/index.js');
const { initializeMetrics, metricsRouter, metricsMiddleware } = require('./utils/metrics');



const logger = require('./utils/logger.js');


const app = express();
const port = 8015;
app.use(helmet());

app.use(express.json()); // Pour parser le JSON dans les requêtes
app.use(express.urlencoded({ extended: true })); // Pour parser les données de formulaire

// Set up CORS options
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
const io = new http.Server(app, {
  cors: corsOptions,
});


// Enable CORS
app.use(cors(corsOptions));

// 🔧 INITIALISATION DES MÉTRIQUES (OBLIGATOIRE)
initializeMetrics('authentification');

// 📊 MIDDLEWARE MÉTRIQUES (avant les autres middlewares)
app.use(metricsMiddleware);

// 🛣️ ROUTES MÉTRIQUES
app.use(metricsRouter);

// Gestion d'erreur globale avec métriques
app.use((err, req, res, next) => {
  const { recordError } = require('./utils/metrics');
  recordError('unhandled_error', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Gestion des erreurs CSRF
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ message: 'Token CSRF invalide ou manquant.' });
  }
  next(err);
});

// Database connection function
async function connectWithRetry() {
  const pRetry = (await import('p-retry')).default;
  return pRetry(
    () =>
      mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }),
    {
      retries: 3,
      onFailedAttempt: (error) => {
        logger.info(`Tentative ${error.attemptNumber} échouée. Erreur: ${error.message}`);
      },
    }
  );
}

// Configuration de la sauvegarde
const backupConfig = {
  containerName: process.env.AZURE_CONTAINER_NAME_BACKUP, // Nom du conteneur Azure
  notificationUrl: process.env.NOTIFICATION_URL, // URL de notification (ntfy.sh)
};

// Application initialization function
const initializeApp = async () => {
  try {
    // Step 1: Connect to the database
    await connectWithRetry()
      .then(() => logger.info('Connecté à MongoDB'))
      .catch((err) => logger.error(`Impossible de se connecter après 3 tentatives. ${err}`, err));
    mongoose.set('debug', true); // Temps d'exécution des requêtes de base de données

   

    

    logger.info('Application initialisée avec succès');
  } catch (error) {
    logger.error('Initialization failed:', error);
  }
};

app.use(express.json());
// app.use(trackBandwidth);
// app.use(trackSuccessFailure);
app.use('/api', router);
app.use(
  timeout.handler({
    timeout: 10000,
    onTimeout: (res) => {
      res.status(503).json({ error: 'Requête expirée, veuillez réessayer plus tard.' });
    },
    disable: ['write', 'setHeaders'], // Empêche de modifier les headers après timeout
  })
);
app.use((err, res) => {
  if (err.code === 'ETIMEDOUT') {
    return res.status(504).json({ error: 'Timeout serveur, veuillez réessayer plus tard.' });
  }
  logger.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// app.use(querycacheMiddleware);
// app.use('/metrics', metricsRouter);
const startServer = async () => {
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
