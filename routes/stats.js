import { Router } from "express";
import { getDB } from "../config/db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { isPremium } from "../utils/subscription.js";

const router = Router();

router.get("/vendor", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;

    const [totalServices, activeServices, pendingRequests, acceptedBookings] =
      await Promise.all([
        db.collection("services").countDocuments({ vendorId }),
        db
          .collection("services")
          .countDocuments({ vendorId, status: "approved", isActive: true }),
        db
          .collection("bookings")
          .countDocuments({ vendorId, status: "pending" }),
        db
          .collection("bookings")
          .countDocuments({ vendorId, status: "accepted" }),
      ]);

    res.json({
      totalServices,
      activeServices,
      pendingRequests,
      acceptedBookings,
      plan: isPremium(req.user) ? "premium" : "free",
      subscriptionExpiresAt: req.user.subscriptionExpiresAt || null,
    });
  } catch {
    res.status(500).json({ message: "Failed to load overview" });
  }
});

router.get(
  "/customer",
  verifyToken,
  requireRole("customer", "vendor"),
  async (req, res) => {
    try {
      const bookings = getDB().collection("bookings");
      const customerId = req.user.id;

      const [total, pending, accepted, rejected] = await Promise.all([
        bookings.countDocuments({ customerId }),
        bookings.countDocuments({ customerId, status: "pending" }),
        bookings.countDocuments({ customerId, status: "accepted" }),
        bookings.countDocuments({ customerId, status: "rejected" }),
      ]);

      res.json({ total, pending, accepted, rejected });
    } catch {
      res.status(500).json({ message: "Failed to load overview" });
    }
  },
);

router.get("/admin", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const db = getDB();

    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalServices,
      pendingServices,
      totalTransactions,
    ] = await Promise.all([
      db.collection("users").countDocuments({}),
      db.collection("users").countDocuments({ role: "vendor" }),
      db.collection("users").countDocuments({ role: "customer" }),
      db.collection("services").countDocuments({}),
      db.collection("services").countDocuments({ status: "pending" }),
      db.collection("transactions").countDocuments({}),
    ]);

    res.json({
      totalUsers,
      totalVendors,
      totalCustomers,
      totalServices,
      pendingServices,
      totalTransactions,
    });
  } catch {
    res.status(500).json({ message: "Failed to load overview" });
  }
});

export default router;
