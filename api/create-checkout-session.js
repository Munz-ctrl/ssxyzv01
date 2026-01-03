// /api/create-checkout-session.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PACKS = {
  pack_1:  { label: "$1 (2 runs)",  amount_cents: 100,  credits: 100 },
  pack_5:  { label: "$5 (10 runs)", amount_cents: 500,  credits: 500 },
  pack_10: { label: "$10 (22 runs)",amount_cents: 1000, credits: 1100 }, // +2 free runs
  pack_20: { label: "$20 (45 runs)",amount_cents: 2000, credits: 2250 }  // +5 free runs
};

function getJwt(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const { packId } = req.body || {};
    const pack = PACKS[packId];
    if (!pack) return res.status(400).json({ error: "invalid_pack" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const ORIGIN = process.env.PUBLIC_SITE_ORIGIN || "https://sunsex.xyz";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: "missing_supabase_env" });
    }

    const jwt = getJwt(req);
    if (!jwt) return res.status(401).json({ error: "login_required" });

    // Verify user from JWT
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false }
    });

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: "invalid_session" });
    }

    const userId = userData.user.id;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"], // Apple Pay will show automatically when available
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `DressUp Credits — ${pack.label}` },
            unit_amount: pack.amount_cents
          },
          quantity: 1
        }
      ],
      success_url: `${ORIGIN}/dressup?success=1`,
      cancel_url: `${ORIGIN}/dressup?canceled=1`,
      metadata: {
        user_id: userId,
        credits: String(pack.credits),
        pack_id: packId
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: "checkout_failed", details: e?.message || String(e) });
  }
}
