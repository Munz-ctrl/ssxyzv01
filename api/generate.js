// /api/generate.js
import { createClient } from '@supabase/supabase-js';

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

  let { personUrl, garmentUrl, prompt, uploaderId } = req.body || {};
  personUrl = cleanUrl(personUrl);
  garmentUrl = cleanUrl(garmentUrl);

  if (!personUrl) return res.status(400).json({ error: 'personUrl required' });

  try {
    await assertImage(personUrl);
    if (garmentUrl) await assertImage(garmentUrl);
  } catch (e) {
    return res.status(422).json({ error: 'preflight_failed', details: e.message });
  }

  const START_URL = 'https://api.replicate.com/v1/models/google/nano-banana/predictions';
  const input = {
    prompt: prompt || 'Dress the person image with the uploaded garment. Keep identity, pose and lighting natural; clean seams.',
    image_input: garmentUrl ? [personUrl, garmentUrl] : [personUrl],
    aspect_ratio: '9:16',        // force portrait 9:16
    output_format: 'png'         // preserve quality / transparency
  };

  try {
    // 1) Start prediction
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

    // 2) Poll status
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

    // 3) Try saving the final image to Supabase Storage (safe, server-only)
    let publicSavedUrl = null;
    try {
      const supaUrl = process.env.SUPABASE_URL;
      const supaKey = process.env.SUPABASE_SERVICE_ROLE;
      if (!supaUrl || !supaKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');

      const supa = createClient(supaUrl, supaKey);

      const imgRes = await fetch(outputUrl, { method: 'GET' });
      if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await imgRes.arrayBuffer());

      const safeUser = String(uploaderId || 'anon').replace(/[^a-zA-Z0-9-_]/g, '');
      const key = `dressup/${safeUser}/${Date.now()}.png`;

      const { error: upErr } = await supa.storage.from('generated').upload(key, buf, {
        contentType,
        upsert: true
      });
      if (upErr) throw upErr;

      const { data: pub } = supa.storage.from('generated').getPublicUrl(key);
      publicSavedUrl = pub?.publicUrl || null;
    } catch (e) {
      console.warn('⚠️ Save-to-Supabase failed; returning Replicate URL:', e?.message || e);
    }

    // Prefer Supabase public URL if upload succeeded; otherwise fall back to Replicate URL
    return res.status(200).json({ outputUrl: publicSavedUrl || outputUrl });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
