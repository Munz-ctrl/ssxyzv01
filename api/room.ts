import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_lib/http.js';
import { signedUrl, ToolError, uploadSlot } from './_lib/jobs.js';
import { editWalls, loadRoom } from './_lib/tools/editWalls.js';
import { advanceSurfaceJob, makeSurface, surfacePrice } from './_lib/tools/makeSurface.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO = /^[0-9a-f-]{36}\/surface-photos\/[0-9a-f-]{36}\.jpg$/i;

// Room edits (brief 02d). One function for the whole flow:
//   load      {}                                  -> { room }
//   walls     { ops }                             -> { room }
//   photo     {}                                  -> a signed upload slot for a surface photo + the price
//   surface   { target, preset }                  -> { room }
//   surface   { target, prompt | photo_path }     -> { job_id, cost }
//   status    { job_id }                          -> the surface job, advanced one step (+ room when done)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const body = (req.body ?? {}) as Record<string, unknown>;

    switch (body.action) {
      case 'load':
        return res.status(200).json({ room: await loadRoom(userId) });

      case 'walls':
        return res.status(200).json({ room: await editWalls({ userId, ops: body.ops }) });

      case 'photo': {
        const slot = await uploadSlot(`${userId}/surface-photos/${randomUUID()}.jpg`);
        return res.status(200).json({ ...slot, cost: surfacePrice() });
      }

      case 'surface': {
        const args: Parameters<typeof makeSurface>[0] = { userId, target: body.target };
        if (typeof body.preset === 'string') args.preset = body.preset;
        else if (typeof body.photo_path === 'string') {
          if (!PHOTO.test(body.photo_path) || !body.photo_path.startsWith(`${userId}/`)) return res.status(400).json({ error: 'bad photo' });
          args.photoPath = body.photo_path;
          args.photoUrl = await signedUrl(body.photo_path);
        } else if (typeof body.prompt === 'string') args.prompt = body.prompt;
        const result = await makeSurface(args);
        return res.status(200).json('room' in result ? result : { job_id: result.jobId, cost: result.cost });
      }

      case 'status': {
        if (typeof body.job_id !== 'string' || !UUID.test(body.job_id)) return res.status(400).json({ error: 'bad job id' });
        return res.status(200).json(await advanceSurfaceJob(userId, body.job_id));
      }

      default:
        return res.status(400).json({ error: 'unknown action' });
    }
  } catch (err) {
    if (err instanceof ToolError) return res.status(err.status).json({ error: err.message });
    console.error('[room] failed:', err instanceof Error ? err.message.slice(0, 300) : 'unknown');
    return res.status(500).json({ error: 'something broke. try again.' });
  }
}
