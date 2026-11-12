// /api/dressup/ping.js
import { createClient } from "@supabase/supabase-js";

const ALLOWED = new Set(["page_view"]);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "missing_supabase_env" });

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const type = String(req.body?.type || "page_view");
    if (!ALLOWED.has(type)) return res.status(400).json({ error: "invalid_event_type" });

    const { error } = await sbAdmin.rpc("dressup_analytics_bump", { p_event: type });
    if (error) return res.status(500).json({ error: "bump_failed", details: error.message });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "ping_failed", details: e?.message || String(e) });
  }
}
