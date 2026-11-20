import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { verifyToken } from "./middleware/auth.js";
import servicesRouter from "./routes/services.js";
import adminRouter from "./routes/admin.js";
import bookingsRouter from "./routes/bookings.js";
import statsRouter from "./routes/stats.js";
import paymentsRouter from "./routes/payments.js";
import { stripeWebhook } from "./routes/webhook.js";

const app = express();

const origins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(cors({ origin: origins, credentials: true }));

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch {
    res.status(500).json({ message: "Database connection failed" });
  }
});

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "WedPlan server is running" });
});

app.get("/api/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

app.use("/api/services", servicesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/payments", paymentsRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const port = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

export default app;
