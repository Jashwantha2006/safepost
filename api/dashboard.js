// api/dashboard.js
// POST /api/dashboard
// Body: { email, pwHash }
// Returns all ownership records registered under this email.
// Requires password hash for verification — never returns records without auth.
//
// Response:
// { success: true, records: [...], total: number }
// { error: string }

import { getDb } from './_db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, pwHash } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (!pwHash || pwHash.length < 8) {
      return res.status(400).json({ error: 'Password hash required' });
    }

    const db  = await getDb();
    const col = db.collection('ownership_records');

    // Fetch all records for this email
    // We verify by matching email — pwHash is shown per-record for user to verify
    const records = await col.find(
      { email: email.toLowerCase().trim(), status: 'active' },
      {
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
          pwHash:      1,
          status:      1,
        }
      }
    ).sort({ createdAt: -1 }).limit(50).toArray();

    if (records.length === 0) {
      return res.status(200).json({
        success: true,
        records: [],
        total: 0,
        message: 'No registered files found for this email'
      });
    }

    // Verify at least one record matches the pwHash
    // This prevents random emails from being enumerated
    const verified = records.some(r => r.pwHash === pwHash.substring(0, 16));
    if (!verified) {
      return res.status(403).json({
        error: 'Verification failed — password does not match any registered file for this email'
      });
    }

    // Strip pwHash from response for security
    const safeRecords = records.map(r => {
      const { pwHash: _, ...rest } = r;
      return rest;
    });

    return res.status(200).json({
      success:  true,
      records:  safeRecords,
      total:    safeRecords.length,
    });

  } catch (e) {
    console.error('Dashboard error:', e);
    return res.status(500).json({ error: 'Server error — please try again' });
  }
}
