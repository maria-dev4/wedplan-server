import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { isPremium } from "../utils/subscription.js";

const router = Router();

const services = () => getDB().collection("services");

const FREE_LIMIT = 3;

const categories = [
  "Photography & Videography",
  "Wedding Venues",
  "Decoration & Florist",
  "Catering Services",
  "Makeup & Styling",
  "Wedding Fashion",
];

const sortOptions = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
};

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkServiceData(body) {
  const serviceName = String(body.serviceName || "").trim();
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();
  const location = String(body.location || "").trim();
  const price = Number(body.price);
  const images = Array.isArray(body.images)
    ? body.images
        .map((url) => String(url).trim())
        .filter((url) => url.startsWith("http"))
    : [];

  if (serviceName.length < 3)
    return { error: "Service name must be at least 3 characters" };
  if (!categories.includes(category))
    return { error: "Please choose a valid category" };
  if (description.length < 20)
    return { error: "Description must be at least 20 characters" };
  if (!location) return { error: "Location is required" };
  if (!Number.isFinite(price) || price <= 0)
    return { error: "Price must be a positive number" };
  if (images.length < 1)
    return { error: "At least one service image is required" };
  if (images.length > 5) return { error: "You can upload up to 5 images" };

  return {
    data: { serviceName, category, description, location, price, images },
  };
}

async function hasReachedLimit(user, excludeId) {
  if (isPremium(user)) return false;

  const filter = {
    vendorId: user.id,
    isActive: true,
    status: { $in: ["pending", "approved"] },
  };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const count = await services().countDocuments(filter);
  return count >= FREE_LIMIT;
}

async function withPremium(items) {
  if (!items.length) return items;

  const vendorIds = [...new Set(items.map((s) => s.vendorId))]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const vendors = await getDB()
    .collection("users")
    .find({ _id: { $in: vendorIds } })
    .project({ subscriptionPlan: 1, subscriptionExpiresAt: 1 })
    .toArray();

  const premiumIds = new Set(
    vendors
      .filter((vendor) => isPremium(vendor))
      .map((vendor) => vendor._id.toString()),
  );

  return items.map((service) => ({
    ...service,
    vendorPremium: premiumIds.has(service.vendorId),
  }));
}

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const location = String(req.query.location || "").trim();
    const sort = String(req.query.sort || "newest");
    const pageNumber = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.limit) || 9, 1), 30);

    const filter = { status: "approved", isActive: true };

    if (search) filter.serviceName = new RegExp(escapeRegex(search), "i");
    if (category) filter.category = category;
    if (location) filter.location = new RegExp(escapeRegex(location), "i");

    const total = await services().countDocuments(filter);
    const items = await services()
      .find(filter)
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    res.json({
      services: await withPremium(items),
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch {
    res.status(500).json({ message: "Failed to load services" });
  }
});

router.get("/featured", async (req, res) => {
  try {
    const items = await services()
      .find({ status: "approved", isActive: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.json({ services: await withPremium(items) });
  } catch {
    res.status(500).json({ message: "Failed to load featured services" });
  }
});

router.get("/mine", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    const items = await services()
      .find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ services: items });
  } catch {
    res.status(500).json({ message: "Failed to load your services" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }
    const item = await services().findOne({
      _id: new ObjectId(req.params.id),
      status: "approved",
      isActive: true,
    });
    if (!item) {
      return res
        .status(404)
        .json({ message: "Service not found or not available" });
    }
    const [service] = await withPremium([item]);
    res.json({ service });
  } catch {
    res.status(500).json({ message: "Failed to load service" });
  }
});

router.post("/", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    const { data, error } = checkServiceData(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    if (await hasReachedLimit(req.user)) {
      return res.status(403).json({
        message:
          "Free plan allows only 3 active services. Upgrade to Premium to add more.",
      });
    }

    const now = new Date();
    const result = await services().insertOne({
      ...data,
      vendorId: req.user.id,
      vendorName: req.user.businessName || req.user.name,
      vendorEmail: req.user.email,
      vendorImage: req.user.image || "",
      status: "pending",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      message: "Service submitted for approval",
      id: result.insertedId,
    });
  } catch {
    res.status(500).json({ message: "Failed to create service" });
  }
});

router.patch("/:id", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }
    const { data, error } = checkServiceData(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const result = await services().updateOne(
      { _id: new ObjectId(req.params.id), vendorId: req.user.id },
      { $set: { ...data, updatedAt: new Date() } },
    );

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: "Service updated" });
  } catch {
    res.status(500).json({ message: "Failed to update service" });
  }
});

router.patch(
  "/:id/availability",
  verifyToken,
  requireRole("vendor"),
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid service id" });
      }
      if (typeof req.body.isActive !== "boolean") {
        return res
          .status(400)
          .json({ message: "isActive must be true or false" });
      }

      const serviceId = new ObjectId(req.params.id);
      const existing = await services().findOne({
        _id: serviceId,
        vendorId: req.user.id,
      });
      if (!existing) {
        return res.status(404).json({ message: "Service not found" });
      }

      if (
        req.body.isActive &&
        !existing.isActive &&
        (await hasReachedLimit(req.user, serviceId))
      ) {
        return res.status(403).json({
          message:
            "Free plan allows only 3 active services. Upgrade to Premium to activate more.",
        });
      }

      await services().updateOne(
        { _id: serviceId },
        { $set: { isActive: req.body.isActive, updatedAt: new Date() } },
      );
      res.json({
        message: req.body.isActive
          ? "Service activated"
          : "Service deactivated",
      });
    } catch {
      res.status(500).json({ message: "Failed to update availability" });
    }
  },
);

router.delete("/:id", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid service id" });
    }
    const result = await services().deleteOne({
      _id: new ObjectId(req.params.id),
      vendorId: req.user.id,
    });
    if (!result.deletedCount) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.json({ message: "Service deleted" });
  } catch {
    res.status(500).json({ message: "Failed to delete service" });
  }
});

export default router;
