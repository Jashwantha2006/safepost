// api/delete.js
// DELETE /api/delete
// Body: { ownerId, pwHash }
// Owner proves identity with pwHash before record is deleted.
// This is the GDPR right to erasure endpoint.
//
// Response:
// { success: true, message: string }
// { error: string }

import { getDb } from './_db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ownerId, pwHash } = req.body;

    if (!ownerId || !pwHash) {
      return res.status(400).json({ error: 'ownerId and pwHash required' });
    }

    const db  = await getDb();
    const col = db.collection('ownership_records');

    // Verify ownership — ownerId + pwHash must both match
    const record = await col.findOne({ ownerId, pwHash });

    if (!record) {
      return res.status(403).json({
        error: 'Ownership verification failed — wrong ownerId or password hash'
      });
    }

    await col.deleteOne({ ownerId });

    return res.status(200).json({
      success: true,
      message: 'Your ownership record has been permanently deleted. All data removed.'
    });

  } catch (e) {
    console.error('Delete error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
