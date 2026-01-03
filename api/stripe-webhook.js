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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session?.metadata?.user_id;
      const credits = parseInt(session?.metadata?.credits || "0", 10);

      if (userId && credits > 0) {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send("missing_supabase_env");

        const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { persistSession: false }
        });

        // Add credits + ledger via security definer RPC
        const { error } = await sbAdmin.rpc("dressup_add_credits", {
          p_user: userId,
          p_delta: credits,
          p_reason: "purchase",
          p_source: "stripe"
        });

        if (error) {
          console.error("dressup_add_credits error:", error);
          return res.status(500).send("credit_add_failed");
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("webhook_unhandled:", e);
    return res.status(500).send("webhook_unhandled");
  }
}
