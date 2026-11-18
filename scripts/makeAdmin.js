import "dotenv/config";
import { MongoClient } from "mongodb";

const email = process.argv[2];

if (!email) {
  console.log("Usage: node scripts/makeAdmin.js user@email.com");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const result = await client
  .db(process.env.DB_NAME)
  .collection("users")
  .updateOne({ email }, { $set: { role: "admin" } });

console.log(result.matchedCount ? "Admin role set" : "User not found");
await client.close();
