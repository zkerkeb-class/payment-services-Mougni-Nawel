const express = require("express")
const helmet = require("helmet")
const timeout = require("express-timeout-handler")
const cors = require("cors")
const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env.dev") })

// Import des dépendances internes
const routes = require("./routes")
const { initializeMetrics, metricsRouter, metricsMiddleware } = require("./utils/metrics")
const logger = require("./utils/logger")

// Configuration initiale
const app = express()
const SERVICE_NAME = "payment-service"
const PORT = process.env.PORT

// 1. Middlewares de sécurité renforcés pour les paiements
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "js.stripe.com"],
      frameSrc: ["'self'", "js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "*.stripe.com"],
      connectSrc: ["'self'", "*.stripe.com"],
    }
  }
}))

// 2. Configuration CORS sécurisée
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || []
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
      callback(null, true)
    } else {
      callback(new Error("Origin not allowed by CORS"))
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
  credentials: true
}))

// 3. Middleware spécial pour les webhooks Stripe (doit être avant express.json)
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }))

// 4. Middlewares de parsing standard
app.use(express.json({ 
  limit: "10mb",
  verify: (req, res, buf) => {
    req.rawBody = buf.toString() // Important pour la vérification des signatures
  }
}))
app.use(express.urlencoded({ extended: true }))

// 5. Métriques avec tags spécifiques aux paiements
initializeMetrics()
app.use(metricsMiddleware)
app.use(metricsRouter)

// 6. Routes principales
app.use("/api", routes)

// 7. Health Check avec vérification des clés Stripe
app.get("/health", (req, res) => {
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY
  const status = stripeConfigured ? "UP" : "WARNING"
  
  res.json({
    status,
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    details: {
      stripe: stripeConfigured ? "configured" : "not_configured",
      environment: process.env.NODE_ENV || "development"
    }
  })
})

// 8. Endpoint de vérification de readiness
app.get("/ready", (req, res) => {
  const isReady = !!process.env.STRIPE_SECRET_KEY
  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    dependencies: {
      stripe: isReady
    }
  })
})

// 9. Gestion des timeouts adaptée aux paiements
app.use(
  timeout.handler({
    timeout: 15000, // Timeout plus long pour les opérations de paiement
    onTimeout: (res) => {
      res.status(503).json({ 
        error: "Timeout de traitement du paiement",
        code: "payment_timeout",
        suggestion: "Vérifiez votre connexion et réessayez"
      })
    },
    disable: ["write", "setHeaders"],
  })
)

// 10. Gestion des erreurs spécialisée pour les paiements
app.use((err, req, res, next) => {
  const { recordError } = require("./utils/metrics")
  
  // Enregistrement des métriques avec tags supplémentaires
  const tags = {
    path: req.path,
    method: req.method,
    payment_method: req.body?.payment_method || "unknown"
  }
  recordError("payment_error", err, tags)
  
  logger.error(`[${SERVICE_NAME}] Payment Error:`, {
    error: err.message,
    code: err.code,
    user: req.user?.id || "anonymous",
    path: req.path,
    body: req.body
  })

  // Format standard pour les erreurs de paiement
  const errorResponse = {
    error: {
      type: err.type || "PaymentError",
      code: err.code || "payment_failed",
      message: err.message || "Payment processing failed",
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      retryable: err.retryable || false
    }
  }

  // Masquer les détails sensibles en production
  if (process.env.NODE_ENV === "production") {
    delete errorResponse.error.stack
    delete errorResponse.error.details
  }

  res.status(err.status || 402).json(errorResponse) // 402 = Payment Required
})

// 11. Démarrage du serveur avec vérification des configurations
const startServer = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn("Avertissement : STRIPE_SECRET_KEY non configuré")
  }

  const server = app.listen(PORT, () => {
    logger.info(`🚀 ${SERVICE_NAME} démarré sur le port ${PORT}`)
    logger.info(`💳 Mode Stripe : ${process.env.STRIPE_SECRET_KEY ? 'live' : 'test'}`)
  })

  return server
}

// 12. Graceful shutdown avec gestion des transactions en cours
const shutdown = async () => {
  logger.info("Fermeture du service de paiement...")
  
  try {
    // Ici vous pourriez ajouter la logique pour :
    // - Compléter les transactions en cours
    // - Fermer les connexions à Stripe
    // - Envoyer les métriques finales
    
    process.exit(0)
  } catch (error) {
    logger.error("Erreur critique lors de la fermeture :", error)
    process.exit(1)
  }
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

// Démarrer le serveur
module.exports = startServer()