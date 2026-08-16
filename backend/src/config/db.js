import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../../data/mongo');

let memoryServer = null;

/**
 * Connects to MONGODB_URI when provided. Otherwise boots an embedded MongoDB
 * that stores its files under backend/data/mongo, so the project runs on a
 * machine with no MongoDB installation while still being a real MongoDB.
 */
export async function connectDatabase() {
  let uri = env.mongoUri;

  if (!uri) {
    fs.mkdirSync(dataDir, { recursive: true });
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    try {
      memoryServer = await MongoMemoryServer.create({
        instance: { dbName: 'ride_rescue', dbPath: dataDir, storageEngine: 'wiredTiger' },
      });
    } catch (err) {
      // Only one process at a time may own the data directory.
      throw new Error(
        `Could not start the embedded MongoDB. If the backend server is already running, stop it before seeding (only one process can use ${dataDir}).\nOriginal error: ${err.message}`
      );
    }
    uri = memoryServer.getUri('ride_rescue');
    console.log('[db] embedded MongoDB started, data dir:', dataDir);
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('[db] connected:', uri.replace(/\/\/.*@/, '//<credentials>@'));
  return uri;
}

export async function disconnectDatabase() {
  // The embedded mongod is killed on stop(), so anything still sitting in the
  // WiredTiger cache would be lost. Force a checkpoint first - without this the
  // last writes of a seed run silently disappear.
  if (memoryServer && mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.db.admin().command({ fsync: 1 });
    } catch (err) {
      console.warn('[db] fsync before shutdown failed:', err.message);
    }
  }
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop({ doCleanup: false, force: false });
}
