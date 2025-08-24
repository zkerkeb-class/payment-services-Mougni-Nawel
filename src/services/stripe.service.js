const Stripe = require("stripe")
const axios = require("axios")

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    })
    this.BDD_SERVICE_URL = process.env.BDD_SERVICE_URL
    this.FRONTEND_URL = process.env.FRONTEND_URL
  }

  async createCustomer(user) {
    const customer = await this.stripe.customers.create({
      email: user.email,
      name: `${user.firstname} ${user.lastname}`,
      metadata: { userId: user._id },
    })
    return customer
  }

  async updateUserStripeId(userId, customerId) {
    await axios.patch(`${this.BDD_SERVICE_URL}/api/user/${userId}`, {
      stripeCustomerId: customerId,
    })
  }

  async createCheckoutSession(customerId) {
    return this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.ID_PRICE_PREMIUM,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${this.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.FRONTEND_URL}/cancel`,
      customer: customerId,
      allow_promotion_codes: true,
    })
  }

  async constructWebhookEvent(body, sig) {
    return this.stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  }

  async getUserByStripeInfo(session) {
    if (session.customer_email) {
      const response = await axios.get(
        `${this.BDD_SERVICE_URL}/api/user/by-email/${encodeURIComponent(session.customer_email)}`
      )
      return response.data.data
    } else if (session.customer) {
      const response = await axios.get(`${this.BDD_SERVICE_URL}/api/user/by-stripe-id/${session.customer}`)
      return response.data.data
    }
    return null
  }

  async updateUserSubscription(userId, session) {
    await axios.patch(`${this.BDD_SERVICE_URL}/api/user/${userId}`, {
      typeAbonnement: "premium",
      stripeCustomerId: session.customer,
      subscriptionId: session.subscription,
    })
  }

  async getUserSubscriptions(customerId) {
    return this.stripe.subscriptions.list({
      customer: customerId,
      status: "all",
    })
  }

  async createBillingPortalSession(customerId) {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.FRONTEND_URL}/account`,
    })
  }
}

module.exports = new StripeService()