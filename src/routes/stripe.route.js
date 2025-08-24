const express = require("express")
const router = express.Router()
const stripeController = require("../controllers/subscription.controller")
const authenticate = require("../middleware/auth")

router.post("/webhook", express.raw({ type: "application/json" }), stripeController.handleWebhook)

// Routes protégées
router.post("/create-subscription", authenticate, stripeController.createSubscription)
router.post("/verify-subscription", authenticate, stripeController.verifySubscription)
router.post("/create-portal-session", authenticate, stripeController.createPortalSession)

module.exports = router
