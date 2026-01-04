// /api/stripe-webhook.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("method_not_allowed");

  try {
    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).send("missing_stripe_signature");

    const rawBody = await readRawBody(req);

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).send("missing_webhook_secret");

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Only handle the event we care about
    if (event.type !== "checkout.session.completed") {
      return res.status(200).json({ received: true, ignored: event.type });
    }

    const session = event.data.object;

    // metadata should be on the session (because you set it in create-checkout-session)
    // but we also fallback to payment_intent metadata if needed.
    let md = session?.metadata || {};
    if ((!md.user_id || !md.credits) && session?.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      md = { ...pi.metadata, ...md };
    }

    const userId = md.user_id;
    const credits = Number(md.credits || 0);
    const packId = md.pack_id || "unknown_pack";

    if (!userId || !(credits > 0)) {
      console.warn("Webhook missing metadata", { type: event.type, userId, credits, metadata: md });
      return res.status(200).json({ received: true, skipped: "missing_metadata" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send("missing_supabase_env");

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // IMPORTANT: pass ALL params to avoid PGRST203 + overload ambiguity
    const { error } = await sbAdmin.rpc("dressup_add_credits", {
      p_user: userId,
      p_delta: credits,
      p_reason: `purchase:${packId}`,
      p_source: "stripe",
      p_stripe_session_id: session.id,
    });

    if (error) {
      console.error("dressup_add_credits error:", error);
      return res.status(500).send("credit_add_failed");
    }

    return res.status(200).json({ received: true, credited: credits, userId });
  } catch (e) {
    console.error("stripe-webhook fatal:", e);
    return res.status(500).send("webhook_fatal");
  }
}
