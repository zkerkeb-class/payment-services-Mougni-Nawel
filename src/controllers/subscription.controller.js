const stripeService = require("../services/stripe.service")

const createSubscription = async (req, res) => {
  try {
    const user = req.user
    let customerId = user.stripeCustomerId

    // Créer un client Stripe si nécessaire
    if (!customerId) {
      const customer = await stripeService.createCustomer(user)
      customerId = customer.id
      await stripeService.updateUserStripeId(user._id, customerId)
    }

    // Créer la session de checkout
    const session = await stripeService.createCheckoutSession(customerId)

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        publicKey: process.env.STRIPE_PUBLIC_KEY,
      },
    })
  } catch (error) {
    console.error("Erreur création abonnement:", error)
    res.status(500).json({
      success: false,
      message: "Erreur lors de la création de l'abonnement",
    })
  }
}

const handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"]

  try {
    const event = await stripeService.constructWebhookEvent(req.body, sig)

    // Gérer les événements d'abonnement
    if (event.type === "checkout.session.completed" || event.type === "invoice.payment_succeeded") {
      await handleSubscriptionUpdate(event.data.object)
    }

    res.json({ received: true })
  } catch (error) {
    console.error("Erreur webhook:", error)
    res.status(400).send(`Webhook Error: ${error.message}`)
  }
}

async function handleSubscriptionUpdate(session) {
  try {
    const user = await stripeService.getUserByStripeInfo(session)

    if (!user) {
      console.error("Utilisateur non trouvé pour la session:", session.id)
      return
    }

    await stripeService.updateUserSubscription(user._id, session)
    console.log("Abonnement mis à jour pour:", user.email)
  } catch (error) {
    console.error("Erreur mise à jour abonnement:", error)
  }
}

const verifySubscription = async (req, res) => {
  try {
    const user = req.user

    if (!user.stripeCustomerId) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          status: "no_customer",
        },
      })
    }

    // Vérifier les abonnements actifs
    const subscriptions = await stripeService.getUserSubscriptions(user.stripeCustomerId)
    const activeSubscription = subscriptions.data.find((sub) => ["active", "trialing"].includes(sub.status))

    if (activeSubscription) {
      // Mettre à jour l'utilisateur si nécessaire
      if (user.typeAbonnement !== "premium") {
        await stripeService.updateUserSubscription(user._id, {
          customer: user.stripeCustomerId,
          subscription: activeSubscription.id,
        })
      }

      return res.json({
        success: true,
        data: {
          hasSubscription: true,
          status: activeSubscription.status,
          isPremium: true,
        },
      })
    }

    res.json({
      success: true,
      data: {
        hasSubscription: false,
        status: "inactive",
      },
    })
  } catch (error) {
    console.error("Erreur vérification abonnement:", error)
    res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification",
    })
  }
}

const createPortalSession = async (req, res) => {
  try {
    const user = req.user

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "Aucun compte client trouvé",
      })
    }

    const portalSession = await stripeService.createBillingPortalSession(user.stripeCustomerId)

    res.json({
      success: true,
      data: {
        url: portalSession.url,
      },
    })
  } catch (error) {
    console.error("Erreur portail client:", error)
    res.status(500).json({
      success: false,
      message: "Erreur lors de la création du portail",
    })
  }
}

module.exports = {
  createSubscription,
  handleWebhook,
  verifySubscription,
  createPortalSession,
}