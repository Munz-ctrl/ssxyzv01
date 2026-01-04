// /api/stripe-webhook.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false }
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");

    const sig = req.headers["stripe-signature"];
    const rawBody = await readRawBody(req);

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send("missing_webhook_secret");

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const CREDIT_EVENTS = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded"
]);

if (CREDIT_EVENTS.has(event.type)) {
 // inside: if (CREDIT_EVENTS.has(event.type)) { ... }

const obj = event.data.object;

// Only safely process checkout.session.completed here
// (payment_intent.succeeded doesn't have a "session.id")
if (event.type !== "checkout.session.completed") {
  return res.status(200).json({ received: true, skipped: "not_session_event" });
}

const session = obj;

const userId = session?.metadata?.user_id;
const credits = parseInt(session?.metadata?.credits || "0", 10);
const packId = session?.metadata?.pack_id || "unknown_pack";

if (!userId || !(credits > 0)) {
  console.warn("Webhook missing metadata:", { type: event.type, userId, credits, metadata: session?.metadata });
  return res.status(200).json({ received: true, skipped: "missing_metadata" });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send("missing_supabase_env");

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const creditsToAdd = parseInt(credits, 10);

const { data, error } = await sbAdmin.rpc("dressup_add_credits", {
  p_user: userId,
  p_delta: creditsToAdd,
  p_reason: `purchase:${packId}`,
  p_source: "stripe",
  p_stripe_session_id: session.id,
});


if (error) {
  console.error("dressup_add_credits error:", error);
  return res.status(500).send("credit_add_failed");
}

return res.status(200).json({ received: true });

}


    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("webhook_unhandled:", e);
    return res.status(500).send("webhook_unhandled");
  }
}


// workk