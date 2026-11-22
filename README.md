# WedPlan Server

REST API for the WedPlan wedding planning platform, built with Express.js and MongoDB. It handles services, bookings, dashboard statistics, admin moderation and Stripe subscriptions.

## Links

- Live API: https://wedplan-server-black.vercel.app
- Live website: https://wedplan-nine.vercel.app
- Client repository: https://github.com/maria-dev4/wedplan
- Server repository: https://github.com/maria-dev4/wedplan-server

## Important Features

- JWT verification (Better Auth JWKS) with role-based middleware for Admin, Vendor and Customer.
- Resource ownership checks and server-side validation on every write.
- Blocked users are rejected on every protected route.
- Services API with search, filters, price sorting and pagination.
- Free plan limit of 3 active services, unlimited for Premium vendors.
- Booking rules: no self-booking, no duplicate active requests, pending-only status changes.
- Stripe Checkout subscriptions, with Premium activated only after verified webhook events.
- Read-only admin transaction history.

## Technology Stack

Node.js, Express.js, MongoDB, jose (JWT verification), Stripe, CORS, dotenv.

## Installation

Clone the server repository:

```bash
git clone https://github.com/maria-dev4/wedplan-server.git
cd wedplan-server
npm install
```

## Environment Variables

Create a `.env` file using `.env.example` as a guide.

| Variable | Description |
|---|---|
| `PORT` | Local server port |
| `MONGODB_URI` | MongoDB connection string |
| `DB_NAME` | Database name |
| `CLIENT_URL` | Allowed client origin(s) for CORS, comma separated |
| `AUTH_URL` | Client URL that serves the Better Auth JWKS endpoint |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode) |
| `STRIPE_PRICE_ID` | Stripe recurring price ID for the Premium plan |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `IMGBB_API_KEY` | ImgBB API key |

## Required Application URLs

- Stripe webhook endpoint: `https://wedplan-server-black.vercel.app/api/webhooks/stripe`
- Webhook events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`

## Run Locally

```bash
npm run dev
```

The API runs on http://localhost:5000.

## Create an Admin

Admin accounts cannot be registered publicly. Register a normal account, then run:

```bash
node scripts/makeAdmin.js user@email.com