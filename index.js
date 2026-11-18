import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { verifyToken } from "./middleware/auth.js";
import servicesRouter from "./routes/services.js";
import adminRouter from "./routes/admin.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "WedPlan server is running" });
});

app.get("/api/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

app.use("/api/services", servicesRouter);
app.use("/api/admin", adminRouter);

const port = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((error) => {
    console.error("Database connection failed", error);
    process.exit(1);
  });
