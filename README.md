# SafePost — Protect Before You Post

A web app that lets users protect their photos and videos before posting on social media.  
Detects deepfakes, strips GPS/EXIF data, embeds invisible ownership watermarks, encrypts content, and monitors for reposts.

---

## Project Structure

```
safepost/
├── index.html              ← Rename safepost-phase2.html to this
├── decrypt.html            ← Decrypt portal (Phase 3)
├── package.json            ← Node.js dependencies
├── vercel.json             ← Vercel routes + cron config
├── api/
│   ├── _db.js              ← MongoDB shared connection
│   ├── register.js         ← POST  /api/register  — save ownership record
│   ├── status.js           ← GET   /api/status    — check ownership record
│   ├── delete.js           ← DELETE /api/delete   — GDPR data erasure
│   └── cron.js             ← GET   /api/cron      — daily repost scan (Vercel Cron)
└── README.md
```

---

## How to Deploy — Step by Step

### Step 1 — Prepare files

Rename `safepost-phase2.html` → `index.html`

Your repo should look like:
```
safepost/
├── index.html
├── decrypt.html
├── package.json
├── vercel.json
└── api/
    ├── _db.js
    ├── register.js
    ├── status.js
    ├── delete.js
    └── cron.js
```

### Step 2 — Push to GitHub

```bash
git init
git add .
git commit -m "SafePost Phase 4 - full stack"
git remote add origin https://github.com/YOUR_USERNAME/safepost.git
git push -u origin main
```

### Step 3 — Create MongoDB Atlas database (Free)

1. Go to https://cloud.mongodb.com
2. Create a free account → Create a free M0 cluster
3. Click **Connect** → **Connect your application**
4. Copy the connection string — it looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. Add `/safepost` before the `?` — final string:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/safepost?retryWrites=true&w=majority
   ```
7. In Atlas → Network Access → Add IP Address → Allow from anywhere (0.0.0.0/0)

### Step 4 — Get SerpAPI key (Free — 100 searches/month)

1. Go to https://serpapi.com
2. Create free account
3. Copy your API key from the dashboard

### Step 5 — Set up Gmail App Password for email alerts

1. Go to your Google Account → Security → 2-Step Verification → enable it
2. Go to Security → App Passwords
3. Select app: **Mail** → Select device: **Other** → name it "SafePost"
4. Copy the 16-character app password shown (format: xxxx xxxx xxxx xxxx)
5. Remove the spaces: `xxxxxxxxxxxxxxxx`

### Step 6 — Deploy to Vercel

1. Go to https://vercel.com → Sign in with GitHub
2. Click **Add New Project** → import your `safepost` repo
3. Click **Deploy** (Vercel auto-detects it)

### Step 7 — Add Environment Variables in Vercel

Go to your project → **Settings** → **Environment Variables** → add these one by one:

| Variable Name  | Value                                      | Description                        |
|----------------|--------------------------------------------|------------------------------------|
| `MONGODB_URI`  | `mongodb+srv://user:pass@cluster.../safepost?...` | MongoDB Atlas connection string |
| `SERP_API_KEY` | `your_serpapi_key_here`                    | SerpAPI key for repost scanning    |
| `EMAIL_USER`   | `yourgmail@gmail.com`                      | Gmail address to send alerts FROM  |
| `EMAIL_PASS`   | `xxxxxxxxxxxxxxxx`                         | Gmail App Password (16 chars)      |
| `CRON_SECRET`  | any random string like `safepost2025abc`   | Protects cron endpoint from abuse  |

After adding all variables → click **Redeploy** (top right of deployments tab)

---

## How It Works

### Frontend (index.html)
- User uploads photo/video
- AI deepfake detection (TensorFlow.js face-api) — 4 checks
- EXIF metadata stripped (GPS, device, timestamps)
- Invisible watermark embedded in pixel LSB (owner ID hidden in image)
- AES-256-GCM encryption with PBKDF2 key derivation
- File exported as PNG — encrypted bytes packed in pixel RGBA channels
- User registers email → POST /api/register → saved to MongoDB

### Backend (api/)
- `register.js` — saves {ownerId, email, filename, pwHash} to MongoDB
- `status.js`   — returns ownership record (no email exposed)
- `delete.js`   — GDPR erasure: verifies pwHash then deletes record
- `cron.js`     — runs daily at 9AM UTC, searches for reposted content via SerpAPI, sends email alerts via Nodemailer

### Database (MongoDB Atlas)
Collection: `ownership_records`

```json
{
  "ownerId":     "a1b2c3d4e5f6a7b8",
  "email":       "user@example.com",
  "filename":    "photo.jpg",
  "pwHash":      "a1b2c3d4e5f6a7b8",
  "dfScore":     5,
  "fileSize":    1658880,
  "createdAt":   "2025-03-20T09:05:44.000Z",
  "lastChecked": "2025-03-21T09:00:00.000Z",
  "alertsSent":  0,
  "repostUrls":  [],
  "status":      "active"
}
```

TTL index: auto-deleted after 30 days from `createdAt`.

---

## Live URLs After Deployment

```
https://safepost.vercel.app/          ← Main protect page
https://safepost.vercel.app/decrypt   ← Decrypt portal
https://safepost.vercel.app/api/register  ← POST (frontend calls this)
https://safepost.vercel.app/api/status   ← GET  (frontend calls this)
https://safepost.vercel.app/api/cron     ← GET  (Vercel cron calls this daily)
```

---

## Security Notes

- Password is NEVER sent to the server — only a SHA-256 hash prefix
- Original file is NEVER uploaded — only metadata
- All encryption happens in the browser (Web Crypto API)
- MongoDB Atlas encrypts data at rest by default
- Email stored for alerts only — never sold or shared
- All records auto-deleted after 30 days (TTL index)
- GDPR right to erasure: `/api/delete` endpoint

---

## Phase 5 (Next)
- Owner dashboard — view all registered files + alert history
- Privacy policy page
- Terms of service page
