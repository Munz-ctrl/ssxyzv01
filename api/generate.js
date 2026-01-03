// /api/generate.js
import { createClient } from "@supabase/supabase-js";

function cleanUrl(u, origin = process.env.PUBLIC_SITE_ORIGIN || "https://sunsex.xyz") {
  if (!u) return "";
  let s = String(u).trim()
    .replace(/^url\((.*)\)$/i, "$1")
    .replace(/^['"]|['"]$/g, "");
  if (!/^https?:\/\//i.test(s)) {
    try { s = new URL(s, origin).href; } catch {}
  }
  return s;
}

async function assertImage(url) {
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) throw new Error(`Not http(s): ${url}`);
  const r = await fetch(url, { method: "HEAD" });
  if (!r.ok) throw new Error(`HEAD ${r.status} for ${url}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) throw new Error(`Not image: ${url} (${ct})`);
}

// Helper: make a public URL for a stored object
function publicUrlFor(bucket, path) {
  const base = process.env.SUPABASE_URL;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const COST = 50; // 50 credits = 1 run

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "missing_supabase_env" });
  }

  // Use service role for storage upload + RPC execution
  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // If user is logged in, client sends Bearer token; pass it to RPC via a user-scoped client
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const sbUser = jwt
    ? createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false }
      })
    : null;

  let { personUrl, garmentUrl, prompt, mode, avatarTemplateUrl, extraRefs } = req.body || {};
  personUrl = cleanUrl(personUrl);
  garmentUrl = cleanUrl(garmentUrl);

  const isAvatar = mode === "avatar";

  if (!isAvatar && !personUrl) return res.status(400).json({ error: "personUrl required" });

  try {
    if (!isAvatar) {
      await assertImage(personUrl);
      await assertImage(garmentUrl);
    }
  } catch (e) {
    return res.status(422).json({ error: "preflight_failed", details: e.message });
  }

  // 1) Spend credits FIRST (atomic, server-truth)
  try {
    const rpcClient = sbUser || sbAdmin; // anon users can still spend community via service role RPC
    const { data, error } = await rpcClient.rpc("dressup_consume_credits", { p_cost: COST });
    if (error) throw error;

    if (!data?.ok) {
      return res.status(402).json({
        error: "no_credits",
        credits: {
          communityCredits: data?.community_credits ?? 0,
          communityMax: data?.community_max ?? 250,
          personalCredits: data?.personal_credits ?? 0
        }
      });
    }
  } catch (e) {
    return res.status(500).json({ error: "credit_spend_failed", details: e.message || String(e) });
  }

  // 2) Replicate call (your existing logic, kept mostly intact)
  const modelSlug = "google/nano-banana-pro";
  const START_URL = `https://api.replicate.com/v1/models/${modelSlug}/predictions`;

  

  // Validate required inputs
  if (isAvatar) {
    if (!personUrl) return res.status(400).json({ error: "personUrl required" });
    if (!avatarTemplateUrl) return res.status(400).json({ error: "avatarTemplateUrl required" });
  } else {
    if (!personUrl) return res.status(400).json({ error: "personUrl required" });
    if (!garmentUrl) return res.status(400).json({ error: "garmentUrl required" });
  }

  // Preflight image checks (do this for both modes)
  try {
    if (isAvatar) {
      await assertImage(avatarTemplateUrl);
      await assertImage(personUrl);
      if (Array.isArray(extraRefs)) {
        for (const u of extraRefs) await assertImage(cleanUrl(u));
      }
    } else {
      await assertImage(personUrl);
      await assertImage(garmentUrl);
    }
  } catch (e) {
    return res.status(422).json({ error: "preflight_failed", details: e.message });
  }

  // Build Replicate input by mode (PROMPTS PRESERVED)
  let input;
  if (isAvatar) {
    const refs = Array.isArray(extraRefs) ? extraRefs.map(u => cleanUrl(u)).filter(Boolean) : [];
    const templateAbs = cleanUrl(avatarTemplateUrl);

    input = {
      prompt: prompt || "Replace the person in the template with the subject from the uploaded photos. Keep the template pose, framing, lighting, and scene. Photorealistic.",
      image_input: [templateAbs, personUrl, ...refs],
      aspect_ratio: "9:16",
      resolution: "1K",
      output_format: "jpg"
    };
  } else {
    input = {
      prompt: prompt || "Dress the person image with the newly uploaded garment while keeping everything else unchanged.",
      image_input: [personUrl, garmentUrl],
      aspect_ratio: "9:16",
      resolution: "1K",
      output_format: "jpg"
    };
  }

  let outputUrl = null;

  try {
    const start = await fetch(START_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input })
    });

    if (!start.ok) {
      const details = await start.text();
      return res.status(start.status).json({ error: "replicate_start_failed", details });
    }

    const prediction = await start.json();
    const id = prediction.id;

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const poll = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }
      });

      if (!poll.ok) {
        const details = await poll.text();
        return res.status(poll.status).json({ error: "replicate_poll_failed", details });
      }

      const data = await poll.json();
      if (data.status === "succeeded") {
        const o = data.output;
        outputUrl = Array.isArray(o) ? o[0] : (o?.image || o?.output || o);
        break;
      }

      if (["failed", "canceled"].includes(data.status)) {
        return res.status(500).json({ error: "generation_failed", details: data?.error || data.status });
      }
    }

    if (!outputUrl) return res.status(500).json({ error: "generation_incomplete" });
  } catch (e) {
    return res.status(500).json({ error: "replicate_error", details: e.message || String(e) });
  }

  // 3) Save to Supabase Storage SERVER-SIDE (reliable)
  let finalUrl = outputUrl;

  try {
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
    const arrayBuf = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    // Determine user folder
    let userFolder = "anon";
    if (jwt) {
      const { data: userData } = await sbUser.auth.getUser();
      userFolder = userData?.user?.id || "anon";
    }

    const key = `generated/${userFolder}/${Date.now()}.jpg`;

    const { error: upErr } = await sbAdmin.storage
      .from("userassets")
      .upload(key, arrayBuf, { contentType, upsert: true });

    if (upErr) throw upErr;

    finalUrl = publicUrlFor("userassets", key);
  } catch (e) {
    // If storage fails, still return replicate URL (but credits already spent)
    console.warn("Storage upload failed:", e?.message || e);
  }

  // 4) Return updated chest values (refreshed)
  let chest = null;
  try {
    const { data } = await sbAdmin.rpc("dressup_get_chest");
    chest = data || null;
  } catch (_) {}

  // If logged in, return personal credits too
  let personal = 0;
  if (jwt) {
    try {
      const { data: userData } = await sbUser.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const { data: row } = await sbAdmin
          .from("dressup_personal_credits")
          .select("credits")
          .eq("user_id", uid)
          .maybeSingle();
        personal = row?.credits || 0;
      }
    } catch (_) {}
  }

  return res.status(200).json({
    finalUrl,
    credits: {
      communityCredits: chest?.community_credits ?? 0,
      communityMax: chest?.community_max ?? 250,
      personalCredits: personal
    }
  });
}
