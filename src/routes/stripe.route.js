const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const User = require('../models/user');
const authenticate = require('../middleware/auth');

// Universal Stripe Webhook Handler
router.post('/webhook', 
  bodyParser.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = process.env.NODE_ENV === 'production' || process.env.STRIPE_WEBHOOK_SECRET
        ? stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
        : JSON.parse(req.body.toString()); // Dev fallback
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle subscription events
    switch (event.type) {
      case 'checkout.session.completed':
      case 'invoice.payment_succeeded':
        await updateUserSubscription(event.data.object);
        break;
    }

    res.json({ received: true });
  }
);

// Unified subscription management
async function updateUserSubscription(session) {
  // Trouver l'utilisateur par email ou customer ID
  const user = await User.findOneAndUpdate(
    { 
      $or: [
        { email: session.customer_email },
        { stripeCustomerId: session.customer }
      ]
    },
    { 
      typeAbonnement: session.payment_status === 'paid' ? 'premium' : 'free',
      stripeCustomerId: session.customer,
      subscriptionId: session.subscription || undefined
    },
    { new: true }
  );
  
  // Si nouveau customer, mettre à jour avec l'ID
  if (session.customer && !user.stripeCustomerId) {
    await User.findByIdAndUpdate(user._id, {
      stripeCustomerId: session.customer
    });
  }
  
  return user;
}

// Checkout endpoints (work in both environments)
router.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      customer_email: req.user?.email,
      allow_promotion_codes: true
    });

    res.json({ sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Additional endpoints
router.post('/create-portal-session', async (req, res) => {
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: req.user.stripeCustomerId,
    return_url: process.env.FRONTEND_URL
  });
  res.json({ url: portalSession.url });
});

// routes/stripe.js
router.post('/create-subscription', authenticate, async (req, res) => {
  try {
    let customerId = req.user.stripeCustomerId;

    // Créer un customer si inexistant
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: `${req.user.firstname} ${req.user.lastname}`,
        metadata: { userId: req.user._id.toString() }
      });
      customerId = customer.id;
      
      // Mettre à jour l'utilisateur
      await User.findByIdAndUpdate(req.user._id, {
        stripeCustomerId: customerId
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.ID_PRICE_PREMIUM,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      customer: customerId, // Utiliser l'ID existant ou nouveau
      allow_promotion_codes: true
    });

    res.json({ 
      sessionId: session.id,
      publicKey: process.env.STRIPE_PUBLIC_KEY
    });
  } catch (err) {
    console.error('Stripe Error:', err);
    res.status(500).json({ 
      error: 'Payment initialization failed',
      details: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});


router.post('/verify-subscription', authenticate, async (req, res) => {
  try {
    // 1. Get user from database
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('lelele : ', user)
    console.log('lelele 2: ', user.stripeCustomerId)

    // 2. Check if user has Stripe customer ID
    if (!user.stripeCustomerId) {
      return res.json({
        hasSubscription: false,
        status: 'no_customer_id',
        message: 'User has no associated Stripe customer'
      });
    }

    // 3. Retrieve customer's subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 1,
      status: 'all'
    });

    // 4. Check active subscriptions
    const activeSub = subscriptions.data.find(sub => 
      ['active', 'trialing'].includes(sub.status)
    );

    if (activeSub) {
      // 5. Update user in database if needed
      if (user.typeAbonnement !== 'premium') {
        await User.findByIdAndUpdate(user._id, { 
          typeAbonnement: 'premium',
          subscriptionId: activeSub.id
        });
      }

      return res.json({
        hasSubscription: true,
        status: activeSub.status,
        currentPeriodEnd: activeSub.current_period_end,
        plan: activeSub.items.data[0].price.id,
        cancelAtPeriodEnd: activeSub.cancel_at_period_end
      });
    }

    // 6. Handle no active subscription
    if (user.typeAbonnement === 'premium') {
      await User.findByIdAndUpdate(user._id, { 
        typeAbonnement: 'free'
      });
    }

    res.json({
      hasSubscription: false,
      status: 'inactive',
      message: 'No active subscription found'
    });

  } catch (err) {
    console.error('Subscription Verification Error:', err);
    res.status(500).json({ 
      error: 'Subscription verification failed',
      details: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});

module.exports = router;