import { cors, okOptions, fail, requireMember } from './_helpers.js';

/** Placeholder for realtime broadcast hooks used by the newsroom desk. */
export default async function handler(req, res) {
  cors(res);
  if (okOptions(req, res)) return;
  try {
    const auth = await requireMember(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    return res.status(200).json({ ok: true, channels: [] });
  } catch (err) {
    return fail(res, 500, err.message || 'Server error');
  }
}
