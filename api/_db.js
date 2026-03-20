// api/_db.js
// Shared MongoDB connection — imported by all API routes
// Vercel serverless functions reuse this connection across warm invocations

import { MongoClient } from 'mongodb';

// MONGODB_URI is set in Vercel environment variables
// Format: mongodb+srv://username:password@cluster.mongodb.net/safepost?retryWrites=true&w=majority
const uri    = process.env.MONGODB_URI;
const dbName = 'safepost';

let client = null;
let db     = null;

export async function getDb() {
  if (db) return db; // reuse existing connection (warm lambda)

  if (!uri) throw new Error('MONGODB_URI environment variable is not set in Vercel');

  client = new MongoClient(uri, {
    maxPoolSize:      10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS:          10000,
  });

  await client.connect();
  db = client.db(dbName);

  // Ensure indexes exist — runs once per cold start
  const col = db.collection('ownership_records');
  await col.createIndex({ ownerId: 1 }, { unique: true });
  await col.createIndex({ email:   1 });
  // Auto-delete documents 30 days after createdAt (TTL index)
  await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

  return db;
}
