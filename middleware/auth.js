import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const jwks = createRemoteJWKSet(
  new URL(`${process.env.AUTH_URL}/api/auth/jwks`),
);

export async function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  const token = header.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, jwks);

    const filter = ObjectId.isValid(payload.sub)
      ? { $or: [{ _id: new ObjectId(payload.sub) }, { id: payload.sub }] }
      : { id: payload.sub };

    const user = await getDB().collection("users").findOne(filter);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked" });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      businessName: user.businessName,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission" });
    }
    next();
  };
}
