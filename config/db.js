import { MongoClient } from "mongodb";

let db;
let connection;

export function connectDB() {
  if (!connection) {
    connection = (async () => {
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      db = client.db(process.env.DB_NAME);
      console.log("MongoDB connected");
    })().catch((error) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

export function getDB() {
  return db;
}
