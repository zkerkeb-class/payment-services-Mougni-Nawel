const express = require('express');
const router = express.Router();
const stripeRoute = require('./stripe.route');

router.use('/stripe', stripeRoute);

module.exports = router;
