import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

const bookings = () => getDB().collection("bookings");
const services = () => getDB().collection("services");
const users = () => getDB().collection("users");

function parseEventDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayUTC() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function attachDetails(items) {
  if (!items.length) return [];

  const serviceIds = [...new Set(items.map((b) => b.serviceId.toString()))].map(
    (id) => new ObjectId(id),
  );
  const userIds = [...new Set(items.flatMap((b) => [b.customerId, b.vendorId]))]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const [serviceDocs, userDocs] = await Promise.all([
    services()
      .find({ _id: { $in: serviceIds } })
      .toArray(),
    users()
      .find({ _id: { $in: userIds } })
      .project({ name: 1, email: 1, image: 1, businessName: 1 })
      .toArray(),
  ]);

  const serviceMap = new Map(serviceDocs.map((s) => [s._id.toString(), s]));
  const userMap = new Map(userDocs.map((u) => [u._id.toString(), u]));

  return items.map((booking) => {
    const service = serviceMap.get(booking.serviceId.toString());
    const customer = userMap.get(booking.customerId);
    const vendor = userMap.get(booking.vendorId);

    return {
      ...booking,
      service: service
        ? {
            _id: service._id,
            serviceName: service.serviceName,
            category: service.category,
            price: service.price,
            location: service.location,
            image: service.images?.[0] || "",
          }
        : null,
      customer: customer
        ? { name: customer.name, email: customer.email, image: customer.image }
        : null,
      vendor: vendor
        ? {
            name: vendor.businessName || vendor.name,
            email: vendor.email,
            image: vendor.image,
          }
        : null,
    };
  });
}

router.post(
  "/",
  verifyToken,
  requireRole("customer", "vendor"),
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.body.serviceId)) {
        return res.status(400).json({ message: "Invalid service id" });
      }

      const eventDate = parseEventDate(req.body.eventDate);
      if (!eventDate) {
        return res
          .status(400)
          .json({ message: "Please choose a valid event date" });
      }
      if (eventDate < todayUTC()) {
        return res
          .status(400)
          .json({ message: "Event date cannot be in the past" });
      }

      const eventLocation = String(req.body.eventLocation || "").trim();
      const message = String(req.body.message || "").trim();

      if (eventLocation.length < 3) {
        return res.status(400).json({ message: "Event location is required" });
      }
      if (message.length > 500) {
        return res
          .status(400)
          .json({ message: "Message must be 500 characters or less" });
      }

      const service = await services().findOne({
        _id: new ObjectId(req.body.serviceId),
        status: "approved",
        isActive: true,
      });
      if (!service) {
        return res
          .status(404)
          .json({ message: "Service not found or not available for booking" });
      }
      if (service.vendorId === req.user.id) {
        return res
          .status(403)
          .json({ message: "You cannot book your own service" });
      }

      const duplicate = await bookings().findOne({
        serviceId: service._id,
        customerId: req.user.id,
        eventDate,
        status: { $in: ["pending", "accepted"] },
      });
      if (duplicate) {
        return res.status(409).json({
          message:
            "You already have an active booking request for this service on that date",
        });
      }

      const result = await bookings().insertOne({
        serviceId: service._id,
        vendorId: service.vendorId,
        customerId: req.user.id,
        eventDate,
        eventLocation,
        message,
        status: "pending",
        createdAt: new Date(),
      });

      res
        .status(201)
        .json({ message: "Booking request sent", id: result.insertedId });
    } catch {
      res.status(500).json({ message: "Failed to submit booking request" });
    }
  },
);

router.get(
  "/mine",
  verifyToken,
  requireRole("customer", "vendor"),
  async (req, res) => {
    try {
      const items = await bookings()
        .find({ customerId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ bookings: await attachDetails(items) });
    } catch {
      res.status(500).json({ message: "Failed to load your bookings" });
    }
  },
);

router.get("/vendor", verifyToken, requireRole("vendor"), async (req, res) => {
  try {
    const items = await bookings()
      .find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ bookings: await attachDetails(items) });
  } catch {
    res.status(500).json({ message: "Failed to load booking requests" });
  }
});

router.get(
  "/:id",
  verifyToken,
  requireRole("customer", "vendor"),
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking id" });
      }

      const booking = await bookings().findOne({
        _id: new ObjectId(req.params.id),
        $or: [{ customerId: req.user.id }, { vendorId: req.user.id }],
      });
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const [detailed] = await attachDetails([booking]);
      res.json({ booking: detailed });
    } catch {
      res.status(500).json({ message: "Failed to load booking" });
    }
  },
);

router.patch(
  "/:id/cancel",
  verifyToken,
  requireRole("customer", "vendor"),
  async (req, res) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking id" });
      }

      const bookingId = new ObjectId(req.params.id);
      const result = await bookings().updateOne(
        { _id: bookingId, customerId: req.user.id, status: "pending" },
        { $set: { status: "cancelled" } },
      );

      if (result.matchedCount) {
        return res.json({ message: "Booking request cancelled" });
      }

      const existing = await bookings().findOne({
        _id: bookingId,
        customerId: req.user.id,
      });
      if (!existing) {
        return res.status(404).json({ message: "Booking not found" });
      }
      res
        .status(400)
        .json({ message: `A ${existing.status} booking cannot be cancelled` });
    } catch {
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  },
);

router.patch(
  "/:id/status",
  verifyToken,
  requireRole("vendor"),
  async (req, res) => {
    try {
      const status = String(req.body.status || "");
      if (!["accepted", "rejected"].includes(status)) {
        return res
          .status(400)
          .json({ message: "Status must be accepted or rejected" });
      }
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking id" });
      }

      const bookingId = new ObjectId(req.params.id);
      const result = await bookings().updateOne(
        { _id: bookingId, vendorId: req.user.id, status: "pending" },
        { $set: { status } },
      );

      if (result.matchedCount) {
        return res.json({ message: `Booking request ${status}` });
      }

      const existing = await bookings().findOne({
        _id: bookingId,
        vendorId: req.user.id,
      });
      if (!existing) {
        return res.status(404).json({ message: "Booking not found" });
      }
      res
        .status(400)
        .json({ message: `This request is already ${existing.status}` });
    } catch {
      res.status(500).json({ message: "Failed to update booking request" });
    }
  },
);

export default router;
