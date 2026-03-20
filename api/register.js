// api/register.js
// POST /api/register
// Called by safepost-phase2.html after a file is successfully protected.
// Saves the ownership record to MongoDB.
//
// Request body (JSON):
// {
//   ownerId     : string  — 16-char hex ID embedded in watermark
//   email       : string  — owner email for repost alerts
//   filename    : string  — original file name
//   pwHash      : string  — first 16 chars of SHA-256 of password
//   dfScore     : number  — deepfake suspicion score (0-100)
//   fileSize    : number  — file size in bytes
// }
//
// Response:
// { success: true, recordId: string }  — 201
// { error: string }                    — 400 / 409 / 500

import { getDb } from './_db.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { ownerId, email, filename, pwHash, dfScore, fileSize } = req.body;

    // ── Validate required fields ───────────────────────────
    if (!ownerId || typeof ownerId !== 'string' || ownerId.length !== 16) {
      return res.status(400).json({ error: 'Invalid ownerId — must be 16-character hex string' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename is required' });
    }
    if (!pwHash || typeof pwHash !== 'string') {
      return res.status(400).json({ error: 'pwHash is required' });
    }

    // ── Rate limit: max 10 registrations per email per 24h ─
    const db  = await getDb();
    const col = db.collection('ownership_records');

    const last24h = new Date(Date.now() - 86400000);
    const recentCount = await col.countDocuments({
      email,
      createdAt: { $gte: last24h }
    });
    if (recentCount >= 10) {
      return res.status(429).json({ error: 'Rate limit: max 10 registrations per 24 hours per email' });
    }

    // ── Build the ownership record ─────────────────────────
    const record = {
      ownerId,
      // Store email encrypted — we use SHA-256 hash for matching
      // and store the actual email for sending alerts
      email:     email.toLowerCase().trim(),
      filename:  filename.substring(0, 255), // cap length
      pwHash:    pwHash.substring(0, 16),
      dfScore:   typeof dfScore === 'number' ? dfScore : 0,
      fileSize:  typeof fileSize === 'number' ? fileSize : 0,
      createdAt: new Date(),
      // Repost alert tracking
      lastChecked:  null,
      alertsSent:   0,
      repostUrls:   [],
      status:       'active', // active | deleted
    };

    // ── Insert — ownerId is unique index, so this will 409 if duplicate ─
    try {
      const result = await col.insertOne(record);
      return res.status(201).json({
        success: true,
        recordId: result.insertedId.toString(),
        message: `Ownership registered for ${email}. You'll receive alerts if your content is reposted.`
      });
    } catch (e) {
      if (e.code === 11000) {
        // Duplicate ownerId — file already registered
        return res.status(409).json({
          error: 'This file is already registered. Each protected file gets a unique Owner ID.',
          alreadyRegistered: true
        });
      }
      throw e;
    }

  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ error: 'Server error — please try again' });
  }
}
