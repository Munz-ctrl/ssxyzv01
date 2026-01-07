// /api/generate.js
import { createClient } from "@supabase/supabase-js";

function cleanUrl(u, origin = process.env.PUBLIC_SITE_ORIGIN || "https://sunsex.xyz") {
  if (!u) return "";
  let s = String(u)
    .trim()
    .replace(/^url\((.*)\)$/i, "$1")
    .replace(/^['"]|['"]$/g, "");
  if (!/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s, origin).href;
    } catch {}
  }
  return s;
}

async function assertImage(url) {
  if (!url) throw new Error("missing image url");
  if (!/^https?:\/\//i.test(url)) throw new Error(`Not http(s): ${url}`);
  const r = await fetch(url, { method: "HEAD" });
  if (!r.ok) throw new Error(`HEAD ${r.status} for ${url}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) throw new Error(`Not image: ${url} (${ct})`);
}

function publicUrlFor(bucket, path) {
  const base = process.env.SUPABASE_URL;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const COST = 50; // 50 credits = 1 run

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "missing_supabase_env" });
  }
  if (!REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: "missing_replicate_env" });
  }

  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const sbUser = jwt
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      })
    : null;

  let {
    mode,
    prompt,
    personUrl,
    garmentUrl,
    avatarTemplateUrl,
    extraRefs,
  } = req.body || {};

  mode = (mode || "style").toLowerCase();

  personUrl = cleanUrl(personUrl);
  garmentUrl = cleanUrl(garmentUrl);
  avatarTemplateUrl = cleanUrl(avatarTemplateUrl);

  const refs = Array.isArray(extraRefs) ? extraRefs.map((u) => cleanUrl(u)).filter(Boolean) : [];

  // --- Validate inputs by mode ---
  try {
    if (mode === "style") {
      if (!personUrl) return res.status(400).json({ error: "personUrl required" });
      if (!garmentUrl) return res.status(400).json({ error: "garmentUrl required" });
      await assertImage(personUrl);
      await assertImage(garmentUrl);
    } else if (mode === "avatar") {
      if (!personUrl) return res.status(400).json({ error: "personUrl required" });
      if (!avatarTemplateUrl) return res.status(400).json({ error: "avatarTemplateUrl required" });

      await assertImage(avatarTemplateUrl);
      await assertImage(personUrl);

      for (const u of refs) {
        await assertImage(u);
      }
    } else {
      return res.status(400).json({ error: "invalid_mode" });
    }
  } catch (e) {
    return res.status(422).json({ error: "preflight_failed", details: e.message });
  }

  // 1) Spend credits (server truth)
  let spendResult = null;
  try {
    const rpcClient = sbUser || sbAdmin;
    const { data, error } = await rpcClient.rpc("dressup_consume_credits", { p_cost: COST });
    if (error) throw error;

    spendResult = data;

    if (!data?.ok) {
      return res.status(402).json({
        error: "no_credits",
        credits: {
          communityCredits: data?.community_credits ?? 0,
          communityMax: data?.community_max ?? 250,
          personalCredits: data?.personal_credits ?? 0,
        },
      });
    }
  } catch (e) {
    return res.status(500).json({ error: "credit_spend_failed", details: e.message || String(e) });
  }

  // 2) Replicate
  const modelSlug = "google/nano-banana-pro";
  const START_URL = `https://api.replicate.com/v1/models/${modelSlug}/predictions`;

  const input =
    mode === "style"
      ? {
          prompt:
            prompt ||
            "Dress the person image with the newly uploaded garment while keeping everything else unchanged.",
          image_input: [personUrl, garmentUrl],
          aspect_ratio: "9:16",
          resolution: "1K",
          output_format: "jpg",
        }
      : {
          prompt:
            prompt ||
            "Switch character template in the scene with the character in the uploaded pictures. Maintain photorealism, proportions, and outfit of the uploaded character. Keep the same framing and scene style.",
          image_input: [avatarTemplateUrl, personUrl, ...refs],
          aspect_ratio: "9:16",
          resolution: "1K",
          output_format: "jpg",
        };

  let outputUrl = null;

  try {
    const start = await fetch(START_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input }),
    });

    if (!start.ok) {
      const details = await start.text();
      return res.status(start.status).json({ error: "replicate_start_failed", details });
    }

    const prediction = await start.json();
    const id = prediction.id;

    // Give it enough time (avatar sometimes slower)
    const MAX_POLLS = 150; // 150 * 2s = 5 minutes
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const poll = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });

      if (!poll.ok) {
        const details = await poll.text();
        return res.status(poll.status).json({ error: "replicate_poll_failed", details });
      }

      const data = await poll.json();

      if (data.status === "succeeded") {
        const o = data.output;
        outputUrl = Array.isArray(o) ? o[0] : o?.image || o?.output || o;
        break;
      }

      if (data.status === "failed" || data.status === "canceled") {
        return res.status(500).json({ error: "generation_failed", details: data?.error || data.status });
      }
    }

    if (!outputUrl) {
      // IMPORTANT: credits already spent; we keep it simple for now
      return res.status(504).json({ error: "generation_incomplete" });
    }
  } catch (e) {
    return res.status(500).json({ error: "replicate_error", details: e.message || String(e) });
  }

  // 3) Upload to Supabase storage (best effort)
  let finalUrl = outputUrl;

  try {
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
    const arrayBuf = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    let userFolder = "anon";
    if (jwt && sbUser) {
      const { data: userData } = await sbUser.auth.getUser();
      userFolder = userData?.user?.id || "anon";
    }

    const key = `generated/${userFolder}/${Date.now()}.jpg`;

    const { error: upErr } = await sbAdmin.storage
      .from("userassets")
      .upload(key, arrayBuf, { contentType, upsert: true });

    if (!upErr) finalUrl = publicUrlFor("userassets", key);
  } catch (e) {
    console.warn("Storage upload failed:", e?.message || e);
  }

  // 4) Return fresh credits (server truth)
  let chest = null;
  try {
    const { data } = await sbAdmin.rpc("dressup_get_chest");
    chest = data || null;
  } catch (_) {}

  let personal = 0;
  if (jwt && sbUser) {
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
      communityCredits: chest?.community_credits ?? spendResult?.community_credits ?? 0,
      communityMax: chest?.community_max ?? spendResult?.community_max ?? 250,
      personalCredits: personal ?? spendResult?.personal_credits ?? 0,
    },
  });
}

// work