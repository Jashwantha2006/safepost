// api/cron.js
// Vercel Cron Job — runs every day at 9:00 AM UTC (set in vercel.json)
// GET /api/cron  — called by Vercel's scheduler, NOT by users
//
// What it does:
// 1. Fetches all active ownership records from MongoDB
// 2. For each record, runs a reverse image search via SerpAPI
//    using the ownerId as a search signal
// 3. If stolen reposts are found at new URLs → sends email alert via Nodemailer
// 4. Updates the record with lastChecked timestamp and any new repostUrls
//
// Environment variables needed in Vercel:
//   MONGODB_URI    — MongoDB Atlas connection string
//   SERP_API_KEY   — SerpAPI key (free tier: 100 searches/month)
//   EMAIL_USER     — Gmail address to send alerts FROM
//   EMAIL_PASS     — Gmail App Password (not your regular password)

import { getDb } from './_db.js';
import nodemailer from 'nodemailer';

// ── Email transporter (Gmail with App Password) ─────────────
function makeTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// ── SerpAPI reverse image search ────────────────────────────
// Searches for the ownerId string — since it's embedded in the watermark,
// any page that includes the decoded watermark would surface here.
// In production you'd also upload the image to Google's reverse image search.
async function serpSearch(ownerId) {
  const key = process.env.SERP_API_KEY;
  if (!key) return [];

  try {
    const query  = encodeURIComponent(`"SAFEPOST:${ownerId}"`);
    const url    = `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${key}&num=5`;
    const resp   = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const data   = await resp.json();
    const results = data.organic_results || [];
    // Return just the URLs found
    return results.map(r => r.link).filter(Boolean);
  } catch (e) {
    console.error('SerpAPI error:', e.message);
    return [];
  }
}

// ── Send alert email ─────────────────────────────────────────
async function sendAlert(email, filename, ownerId, newUrls) {
  const transporter = makeTransporter();

  const urlList = newUrls.map((u, i) => `${i + 1}. ${u}`).join('\n');

  await transporter.sendMail({
    from:    `"SafePost Alerts" <${process.env.EMAIL_USER}>`,
    to:      email,
    subject: `⚠ SafePost Alert: Your protected content may have been reposted`,
    text: `
Hi,

SafePost has detected that your protected file may have been shared without your permission.

File: ${filename}
Owner ID: ${ownerId}
Detected at:
${urlList}

What to do:
1. Visit the URL(s) above to verify if this is unauthorised sharing
2. Your Owner ID (${ownerId}) embedded in the watermark proves the content is originally yours
3. You can use this as evidence when reporting to the platform or taking legal action

If this was an authorised share by you, please ignore this email.

— SafePost Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;">
  <div style="background:#080b0f;border-radius:12px;padding:28px;margin-bottom:20px;">
    <h1 style="color:#00e676;font-size:20px;margin:0 0 4px;">SafePost</h1>
    <p style="color:#4a5f72;font-size:12px;margin:0;font-family:monospace;">Repost Alert System</p>
  </div>
  <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e0e0e0;">
    <h2 style="color:#111;font-size:18px;margin:0 0 16px;">⚠ Possible Unauthorised Repost Detected</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 0;color:#666;font-size:13px;border-bottom:1px solid #f0f0f0;">File</td><td style="padding:8px 0;font-size:13px;font-weight:600;border-bottom:1px solid #f0f0f0;">${filename}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px;border-bottom:1px solid #f0f0f0;">Owner ID</td><td style="padding:8px 0;font-family:monospace;font-size:12px;color:#00c853;border-bottom:1px solid #f0f0f0;">${ownerId}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px;">Detected on</td><td style="padding:8px 0;font-size:13px;">${new Date().toLocaleString()}</td></tr>
    </table>
    <p style="font-size:13px;color:#333;font-weight:600;margin-bottom:8px;">Found at the following URL(s):</p>
    ${newUrls.map(u => `<div style="background:#f5f5f5;border-radius:6px;padding:10px;margin-bottom:8px;font-family:monospace;font-size:12px;word-break:break-all;"><a href="${u}" style="color:#1a73e8;">${u}</a></div>`).join('')}
    <div style="background:#fff8e1;border-radius:8px;padding:14px;margin-top:16px;border-left:3px solid #ffc107;">
      <p style="margin:0;font-size:13px;color:#555;">Your <strong>Owner ID (${ownerId})</strong> is embedded invisibly in the watermark of your original file. This serves as proof that you are the original creator.</p>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#999;margin-top:16px;">SafePost · You received this because you registered this file for repost monitoring.<br/>To unsubscribe, delete your ownership record at safepost.vercel.app</p>
</body>
</html>
    `.trim(),
  });
}

// ── MAIN CRON HANDLER ────────────────────────────────────────
export default async function handler(req, res) {
  // Vercel calls this as GET — verify it's the cron caller
  // In production Vercel sends CRON_SECRET header
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  let checked = 0, alerted = 0, errors = 0;

  try {
    const db  = await getDb();
    const col = db.collection('ownership_records');

    // Only scan active records — limit to 50 per run (free SerpAPI tier)
    const records = await col.find(
      { status: 'active' },
      { limit: 50, sort: { lastChecked: 1 } } // oldest-checked first
    ).toArray();

    console.log(`Cron: scanning ${records.length} ownership records`);

    for (const record of records) {
      try {
        // Run reverse image search
        const foundUrls = await serpSearch(record.ownerId);

        // Filter out URLs we already know about
        const knownUrls = record.repostUrls || [];
        const newUrls   = foundUrls.filter(u => !knownUrls.includes(u));

        // Update lastChecked regardless
        const update = { $set: { lastChecked: new Date() } };

        if (newUrls.length > 0) {
          // New repost URLs found — send alert
          update.$push = { repostUrls: { $each: newUrls } };
          update.$inc  = { alertsSent: 1 };

          try {
            await sendAlert(record.email, record.filename, record.ownerId, newUrls);
            alerted++;
            console.log(`Alert sent to ${record.email} for ${record.ownerId} — ${newUrls.length} new URLs`);
          } catch (emailErr) {
            console.error(`Email failed for ${record.ownerId}:`, emailErr.message);
          }
        }

        await col.updateOne({ ownerId: record.ownerId }, update);
        checked++;

      } catch (recordErr) {
        console.error(`Error scanning ${record.ownerId}:`, recordErr.message);
        errors++;
      }

      // Small delay between API calls — respect SerpAPI rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Cron complete: ${checked} checked, ${alerted} alerted, ${errors} errors — ${duration}s`);

    return res.status(200).json({
      success: true,
      checked,
      alerted,
      errors,
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    console.error('Cron fatal error:', e);
    return res.status(500).json({ error: e.message });
  }
}
