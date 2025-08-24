const express = require("express")
const router = express.Router()
const stripeRoutes = require("./stripe.route")

router.use("/stripe", stripeRoutes)

module.exports = router
