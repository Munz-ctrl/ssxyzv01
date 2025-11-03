// /api/generate.js
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
  if (!/^https?:\/\//i.test(url)) throw new Error(`Not http(s): ${url}`);
  const r = await fetch(url, { method: 'HEAD' });
  if (!r.ok) throw new Error(`HEAD ${r.status} for ${url}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error(`Not image: ${url} (${ct})`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

    let { personUrl, garmentUrl, templateUrl, prompt, mode } = req.body || {};

  personUrl   = cleanUrl(personUrl);
  garmentUrl  = cleanUrl(garmentUrl);
  templateUrl = cleanUrl(templateUrl); // may be '' if not provided


   if (!personUrl) {
    return res.status(400).json({ error: 'personUrl required' });
  }

  try {
    // verify all URLs we plan to send to the model are valid images
    await assertImage(personUrl);

    if (garmentUrl) {
      await assertImage(garmentUrl);
    }

    if (templateUrl) {
      await assertImage(templateUrl);
    }
  } catch (e) {
    return res.status(422).json({
      error: 'preflight_failed',
      details: e.message
    });
  }


  const START_URL = 'https://api.replicate.com/v1/models/google/nano-banana/predictions';

  // Build ordered image_input for Nano Banana
  // Priority/order logic:
  // 1. templateUrl (the "scene style / camera")
  // 2. personUrl   (the subject / identity)
  // 3. garmentUrl  (the clothing overlay reference)
  //
  // We only include what's defined.
  const imageInputs = [];
  if (templateUrl) imageInputs.push(templateUrl);
  if (personUrl)   imageInputs.push(personUrl);
  if (garmentUrl)  imageInputs.push(garmentUrl);

  const input = {
    prompt:
      prompt ||
      (
        templateUrl
          ? 'Recreate the subject using the same camera angle, framing, lighting, and background style as the first image. Keep the subject’s identity, body shape, and pose consistent with the second image. Add/merge the clothing from the third image cleanly if provided. Maintain photoreal 9:16 portrait.'
          : 'Dress the person image with the uploaded garment. Keep identity, pose and lighting natural; clean seams.'
      ),

    image_input: imageInputs,

    // hard-lock framing so every result fits our hero div
    aspect_ratio: '9:16',
    output_format: 'png'
  };



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
      return res.status(start.status).json({ error: 'replicate_start_failed', details });
    }

    const prediction = await start.json();
    const id = prediction.id;

    let status = prediction.status;
    let outputUrl = null;

    for (let i = 0; i < 60 && ['starting','processing','queued'].includes(status); i++) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }
      });
      if (!poll.ok) {
        const details = await poll.text();
        return res.status(poll.status).json({ error: 'replicate_poll_failed', details });
      }
      const data = await poll.json();
      status = data.status;
      if (status === 'succeeded') {
        const o = data.output;
        outputUrl = Array.isArray(o) ? o[0] : (o?.image || o?.output || o);
      }
    }

    if (!outputUrl) return res.status(500).json({ error: 'generation_incomplete', status });
    return res.status(200).json({ outputUrl });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
