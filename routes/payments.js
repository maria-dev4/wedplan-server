import { Router } from "express";
import { getDB } from "../config/db.js";
import { stripe } from "../config/stripe.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { isPremium } from "../utils/subscription.js";

const router = Router();

const transactions = () => getDB().collection("transactions");

router.use(verifyToken, requireRole("vendor"));

router.post("/checkout", async (req, res) => {
  try {
    if (isPremium(req.user)) {
      return res
        .status(400)
        .json({ message: "You already have an active Premium plan" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: req.user.email,
      client_reference_id: req.user.id,
      metadata: { vendorId: req.user.id },
      subscription_data: { metadata: { vendorId: req.user.id } },
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch {
    res
      .status(500)
      .json({ message: "Could not start the payment. Please try again." });
  }
});

router.get("/session/:sessionId", async (req, res) => {
  try {
    const transaction = await transactions().findOne({
      stripeSessionId: req.params.sessionId,
      vendorId: req.user.id,
    });

    if (!transaction) {
      return res.json({ status: "processing" });
    }

    res.json({
      status: transaction.status,
      plan: transaction.plan,
      amount: transaction.amount,
      currency: transaction.currency,
    });
  } catch {
    res.status(500).json({ message: "Failed to check payment status" });
  }
});

router.post("/cancel", async (req, res) => {
  try {
    const transaction = await transactions().findOne(
      {
        vendorId: req.user.id,
        status: "paid",
        stripeSubscriptionId: { $ne: null },
      },
      { sort: { createdAt: -1 } },
    );

    if (!transaction) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    await stripe.subscriptions.update(transaction.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      message:
        "Your Premium plan will end at the close of the current billing period",
    });
  } catch {
    res.status(500).json({ message: "Could not cancel the subscription" });
  }
});

export default router;
