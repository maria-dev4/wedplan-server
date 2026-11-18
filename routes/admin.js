import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

const services = () => getDB().collection("services");

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const users = () => getDB().collection("users");

const userFields = {
  name: 1,
  email: 1,
  image: 1,
  role: 1,
  isBlocked: 1,
  businessName: 1,
  subscriptionPlan: 1,
  subscriptionExpiresAt: 1,
  createdAt: 1,
};
router.use(verifyToken, requireRole("admin"));

router.get("/services", async (req, res) => {
  try {
    const status = String(req.query.status || "").trim();
    const category = String(req.query.category || "").trim();
    const search = String(req.query.search || "").trim();

    const filter = {};
    if (["pending", "approved", "rejected"].includes(status))
      filter.status = status;
    if (category) filter.category = category;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { serviceName: regex },
        { vendorName: regex },
        { location: regex },
      ];
    }

    const items = await services()
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ services: items });
  } catch {
    res.status(500).json({ message: "Failed to load services" });
  }
});

router.patch("/services/:id/status", async (req, res) => {
  try {
    const status = String(req.body.status || "");
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }

    const result = await services().updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: `Service ${status}` });
  } catch {
    res.status(500).json({ message: "Failed to update status" });
  }
});

router.delete("/services/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }
    const result = await services().deleteOne({
      _id: new ObjectId(req.params.id),
    });
    if (!result.deletedCount) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: "Service deleted" });
  } catch {
    res.status(500).json({ message: "Failed to delete service" });
  }
});
router.get("/users", async (req, res) => {
  try {
    const role = String(req.query.role || "").trim();
    const search = String(req.query.search || "").trim();

    const filter = {};
    if (["admin", "vendor", "customer"].includes(role)) filter.role = role;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const items = await users()
      .find(filter)
      .project(userFields)
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ users: items });
  } catch {
    res.status(500).json({ message: "Failed to load users" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const user = await users()
      .find({ _id: new ObjectId(req.params.id) })
      .project(userFields)
      .next();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ user });
  } catch {
    res.status(500).json({ message: "Failed to load user" });
  }
});

router.patch("/users/:id/block", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (typeof req.body.isBlocked !== "boolean") {
      return res
        .status(400)
        .json({ message: "isBlocked must be true or false" });
    }

    const target = await users().findOne({ _id: new ObjectId(req.params.id) });
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (target.role === "admin") {
      return res
        .status(403)
        .json({ message: "Admin accounts cannot be blocked" });
    }

    await users().updateOne(
      { _id: target._id },
      { $set: { isBlocked: req.body.isBlocked } },
    );
    res.json({
      message: req.body.isBlocked ? "User blocked" : "User unblocked",
    });
  } catch {
    res.status(500).json({ message: "Failed to update user" });
  }
});

export default router;
