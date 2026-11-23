import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_lib/http.js';
import { uploadSlot } from './_lib/jobs.js';
import { avatarConfig } from './_lib/tools/avatarConfig.js';
import {
  advanceAvatarJob,
  AvatarError,
  avatarPrice,
  createAvatar,
  discardAvatar,
  keepAvatar,
  renormalizeAvatar,
  signedUrl,
} from './_lib/tools/createAvatar.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO = /^[0-9a-f-]{36}\/avatar-photos\/[0-9a-f-]{36}\.jpg$/i;

// One function for the whole avatar flow (keeps the Vercel function count low).
//   prepare  { count }                 -> signed upload slots for the photos + the price
//   create   { photo_paths, height_m } -> { job_id }
//   status   { job_id }                -> the job, advanced one step
//   keep     { avatar_id }
//   discard  { avatar_id }             -> the room goes back to the previous avatar
//   renormalize { avatar_id }          -> runs the normalizer again on the saved cutout, free
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const body = (req.body ?? {}) as Record<string, unknown>;

    switch (body.action) {
      case 'prepare': {
        const { max } = avatarConfig().photos;
        const count = Math.max(1, Math.min(max, Math.round(Number(body.count) || 1)));
        const uploads = await Promise.all(
          Array.from({ length: count }, () => uploadSlot(`${userId}/avatar-photos/${randomUUID()}.jpg`)),
        );
        return res.status(200).json({ uploads, ...(await avatarPrice(userId)) });
      }

      case 'create': {
        const paths = Array.isArray(body.photo_paths) ? body.photo_paths : [];
        if (!paths.every((p) => typeof p === 'string' && PHOTO.test(p) && p.startsWith(`${userId}/`))) {
          return res.status(400).json({ error: 'bad photos' });
        }
        const photoUrls = await Promise.all((paths as string[]).map(signedUrl));
        const { jobId, cost } = await createAvatar({ userId, photoUrls, photoPaths: paths as string[], heightM: Number(body.height_m) });
        return res.status(200).json({ job_id: jobId, cost });
      }

      case 'status': {
        if (typeof body.job_id !== 'string' || !UUID.test(body.job_id)) return res.status(400).json({ error: 'bad job id' });
        return res.status(200).json(await advanceAvatarJob(userId, body.job_id));
      }

      case 'keep':
      case 'discard': {
        if (typeof body.avatar_id !== 'string' || !UUID.test(body.avatar_id)) return res.status(400).json({ error: 'bad avatar id' });
        await (body.action === 'keep' ? keepAvatar : discardAvatar)(userId, body.avatar_id);
        return res.status(200).json({ ok: true });
      }

      case 'renormalize': {
        if (typeof body.avatar_id !== 'string' || !UUID.test(body.avatar_id)) return res.status(400).json({ error: 'bad avatar id' });
        return res.status(200).json(await renormalizeAvatar(userId, body.avatar_id));
      }

      default:
        return res.status(400).json({ error: 'unknown action' });
    }
  } catch (err) {
    if (err instanceof AvatarError) return res.status(err.status).json({ error: err.message });
    console.error('[avatar] failed:', err instanceof Error ? err.message.slice(0, 300) : 'unknown');
    return res.status(500).json({ error: 'something broke. try again.' });
  }
}
