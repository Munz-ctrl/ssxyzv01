// /api/generate.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const {
    model = "google/nano-banana",   // keep Nano Banana as default
    personUrl,                      // Munz/base image URL (required)
    garmentUrl,                     // garment image URL (2nd image)
    prompt                          // optional text steering
  } = req.body || {};

  if (!personUrl) return res.status(400).json({ error: "personUrl required" });

  // 👇 These keys must match the model’s HTTP example
  const input = {
    prompt: prompt || "Dress the person image with the garment image. Keep identity, pose, clean seams, natural lighting.",
    image_input: garmentUrl ? [personUrl, garmentUrl] : [personUrl]
  };

  // You can use model OR a pinned version id. Model is fine to start.
  const body = { model, input };

  try {
    // start prediction
    const start = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!start.ok) {
      const text = await start.text();
      return res.status(start.status).json({ error: `Replicate start error: ${text}` });
    }

    const prediction = await start.json();
    const id = prediction.id;

    // poll until finished
    let status = prediction.status;
    let outputUrl = null;
    const maxPolls = 60;
    let count = 0;

    while (status === "starting" || status === "processing" || status === "queued") {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}` }
      });
      const data = await poll.json();
      status = data.status;

      if (status === "succeeded") {
        const out = data.output;
        // some models return array, some string/object
        outputUrl = Array.isArray(out) ? out[0] : (out?.image || out?.output || out);
      }
      if (++count >= maxPolls) break;
    }

    if (!outputUrl) {
      return res.status(500).json({ error: `Generation failed or timed out (status: ${status})` });
    }

    return res.status(200).json({ outputUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
