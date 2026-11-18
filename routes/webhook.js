import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { stripe } from "../config/stripe.js";

function periodEndOf(subscription) {
  const seconds =
    subscription.items?.data?.[0]?.current_period_end ??
    subscription.current_period_end;
  return seconds
    ? new Date(seconds * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

async function activatePremium(vendorId, expiresAt) {
  if (!ObjectId.isValid(vendorId)) return;
  await getDB()
    .collection("users")
    .updateOne(
      { _id: new ObjectId(vendorId) },
      {
        $set: { subscriptionPlan: "premium", subscriptionExpiresAt: expiresAt },
      },
    );
}

async function handleCheckoutCompleted(session) {
  if (session.mode !== "subscription" || session.payment_status !== "paid")
    return;

  const vendorId = session.metadata?.vendorId;
  if (!vendorId) return;

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription,
  );

  await getDB()
    .collection("transactions")
    .updateOne(
      { stripeSessionId: session.id },
      {
        $setOnInsert: {
          vendorId,
          plan: "premium",
          amount: (session.amount_total || 0) / 100,
          currency: session.currency,
          stripeSessionId: session.id,
          stripeSubscriptionId: session.subscription,
          status: "paid",
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

  await activatePremium(vendorId, periodEndOf(subscription));
}

async function handleInvoicePaid(invoice) {
  if (invoice.billing_reason !== "subscription_cycle") return;

  const subscriptionId =
    invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const vendorId = subscription.metadata?.vendorId;
  if (!vendorId) return;

  await activatePremium(vendorId, periodEndOf(subscription));
}

async function handleSubscriptionDeleted(subscription) {
  const vendorId = subscription.metadata?.vendorId;
  if (!vendorId || !ObjectId.isValid(vendorId)) return;

  await getDB()
    .collection("users")
    .updateOne(
      { _id: new ObjectId(vendorId) },
      { $set: { subscriptionPlan: "free", subscriptionExpiresAt: null } },
    );
}

export async function stripeWebhook(req, res) {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return res.status(400).send("Invalid webhook signature");
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object);
    }
    res.json({ received: true });
  } catch {
    res.status(500).json({ message: "Webhook handling failed" });
  }
}
