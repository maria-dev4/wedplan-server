import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
let db;

export async function connectDB() {
  await client.connect();
  db = client.db(process.env.DB_NAME);
  console.log("MongoDB connected");
}

export function getDB() {
  return db;
}
