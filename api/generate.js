// /api/generate.js

// ---------- helpers ----------
function cleanUrl(u, origin = process.env.PUBLIC_SITE_ORIGIN || 'https://sunsex.xyz') {
  if (!u) return '';
  let s = String(u).trim()
    .replace(/^url\((.*)\)$/i, '$1')
    .replace(/^['"]|['"]$/g, '');
  if (!/^https?:\/\//i.test(s)) {
    try { s = new URL(s, origin).href; } catch {}
  }
  return s;
}

async function assertImage(url) {
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) throw new Error(`Not http(s): ${url}`);
  const r = await fetch(url, { method: 'HEAD' });
  if (!r.ok) throw new Error(`HEAD ${r.status} for ${url}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error(`Not image: ${url} (${ct})`);
}

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  let {
    personUrl,
    garmentUrl,
    prompt,
    mode,              // "style" | "tryon" | "avatar"
    avatarTemplateUrl, // template (Munz) for avatar mode
    extraRefs          // array of extra ref images for avatar mode
  } = req.body || {};

  personUrl        = cleanUrl(personUrl);
  garmentUrl       = cleanUrl(garmentUrl);
  avatarTemplateUrl = cleanUrl(avatarTemplateUrl);

  const extraImages = Array.isArray(extraRefs)
    ? extraRefs.map((u) => cleanUrl(u)).filter(Boolean)
    : [];

  const isAvatar = mode === 'avatar';

  // STYLE / TRYON require a personUrl
  if (!isAvatar && !personUrl) {
    return res.status(400).json({ error: 'personUrl required' });
  }

  try {
    await assertImage(personUrl);
    // await assertImage(garmentUrl);  <--- removed it ! 
    await assertImage(avatarTemplateUrl);
    for (const u of extraImages) {
      await assertImage(u);
    }
  } catch (e) {
    return res.status(422).json({ error: 'preflight_failed', details: e.message });
  }

  // ---------- select model ----------
  // STYLE / TRYON → regular nano-banana
  // AVATAR       → nano-banana-pro
  const modelSlug = isAvatar
    ? 'google/nano-banana-pro'
    : 'google/nano-banana-pro'; // <-- switch for style stuff

  const START_URL = `https://api.replicate.com/v1/models/${modelSlug}/predictions`;

  // ---------- build image_input + prompt ----------
  let image_input;
  let finalPrompt;

  if (isAvatar) {
    // template first, then main ref, then extra refs
    const imgs = [];
    if (avatarTemplateUrl) imgs.push(avatarTemplateUrl);
    if (personUrl)        imgs.push(personUrl);
    imgs.push(...extraImages);

    if (!imgs.length) {
      return res.status(400).json({
        error: 'no_avatar_images',
        details: 'Upload at least one avatar photo.'
      });
    }

    image_input = imgs;

    finalPrompt = prompt || (
      'Using the template isometric avatar image as pose, framing and art direction, ' +
      'generate a new isometric, photoreal avatar that matches the person in the uploaded reference photo(s). ' +
      'Maintain identity, skin tone, hairstyle and overall vibe. Keep lighting, camera angle and background consistent with the template.'
    );
  } else {
    // Default STYLE / TRYON behaviour: person + garment
    image_input = garmentUrl ? [personUrl, garmentUrl] : [personUrl];

    finalPrompt = prompt || (
      'Dress the person image with the newly uploaded garment while keeping all other existing clothing and visual ' +
      'details unchanged. Preserve the person’s identity, pose, lighting, and background exactly as in the input image. ' +
      'Only modify the region necessary to add the new garment; keep previous garments intact and seamless.'
    );
  }

  const input = {
    prompt: finalPrompt,
    image_input,
    aspect_ratio: '9:16',
    output_format: 'png'
  };

  // ---------- Replicate call ----------
  try {
    const start = await fetch(START_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input })
    });

    if (!start.ok) {
      const details = await start.text();
      return res.status(start.status).json({
        error: 'replicate_start_failed',
        details
      });
    }

    const prediction = await start.json();
    const id = prediction.id;
    let status = prediction.status;
    let outputUrl = null;

    // simple polling loop
    for (let i = 0; i < 60 && ['starting', 'processing', 'queued'].includes(status); i++) {
      await new Promise(r => setTimeout(r, 2000));

      const poll = await fetch(
        `https://api.replicate.com/v1/predictions/${id}`,
        { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` } }
      );

      if (!poll.ok) {
        const details = await poll.text();
        return res.status(poll.status).json({
          error: 'replicate_poll_failed',
          details
        });
      }

      const data = await poll.json();
      status = data.status;

      if (status === 'succeeded') {
        const o = data.output;
        outputUrl = Array.isArray(o) ? o[0] : (o?.image || o?.output || o);
      }
    }

    if (!outputUrl) {
      return res.status(500).json({
        error: 'generation_incomplete',
        status
      });
    }

    return res.status(200).json({ outputUrl });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
