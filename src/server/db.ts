import mongoose from "mongoose";
type Cache = { connection: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const root = globalThis as typeof globalThis & { __cdMongo?: Cache };
const cache = root.__cdMongo ??= { connection: null, promise: null };
export async function connectDatabase() {
  if (cache.connection) return cache.connection;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required before enabling persistent application routes.");
  cache.promise ??= mongoose.connect(uri, { bufferCommands: false });
  try { cache.connection = await cache.promise; return cache.connection; }
  catch (error) { cache.promise = null; throw error; }
}
