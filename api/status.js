// api/status.js
// GET /api/status?ownerId=abc123...
// Returns the ownership record for a given ownerId.
// Used by the decrypt page to show ownership proof.
//
// Response:
// { found: true, record: { ownerId, filename, createdAt, alertsSent, repostUrls } }
// { found: false }
// { error: string }

import { getDb } from './_db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const { ownerId } = req.query;

  if (!ownerId || typeof ownerId !== 'string' || ownerId.length !== 16) {
    return res.status(400).json({ error: 'Invalid ownerId' });
  }

  try {
    const db  = await getDb();
    const col = db.collection('ownership_records');

    const record = await col.findOne(
      { ownerId },
      {
        // Never return email in response — privacy
        projection: {
          _id:         0,
          ownerId:     1,
          filename:    1,
          createdAt:   1,
          dfScore:     1,
          fileSize:    1,
          alertsSent:  1,
          repostUrls:  1,
          lastChecked: 1,
          status:      1,
        }
      }
    );

    if (!record) return res.status(200).json({ found: false });

    return res.status(200).json({ found: true, record });

  } catch (e) {
    console.error('Status error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
