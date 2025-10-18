export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const { personUrl, garmentUrl, prompt } = req.body || {};
  if (!personUrl) return res.status(400).json({ error: 'personUrl required' });

  // Model-specific endpoint (no version required for this style)
  const START_URL = 'https://api.replicate.com/v1/models/google/nano-banana/predictions';

  const input = {
    prompt: prompt || "Dress the person image with the uploaded garment. Keep identity, pose and lighting natural; clean seams.",
    image_input: garmentUrl ? [personUrl, garmentUrl] : [personUrl]
  };

  try {
    // 1) Start job
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

    // 2) Poll until finished
    let status = prediction.status;
    let outputUrl = null;
    const MAX = 60;
    let tries = 0;

    while (['starting', 'processing', 'queued'].includes(status)) {
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
      if (++tries >= MAX) break;
    }

    if (!outputUrl) {
      return res.status(500).json({ error: `generation_incomplete`, status });
    }

    res.status(200).json({ outputUrl });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
