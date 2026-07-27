# RideSync Backend

Backend API + real-time engine for **RideSync – Smart Group Ride Companion**.

## Stack
- Node.js + Express.js (REST API)
- Socket.IO (real-time location, SOS, chat events)
- MongoDB Atlas + Mongoose
- JWT auth + bcrypt password hashing

## Project Structure
```
ridesync-backend/
├── config/
│   └── db.js                 # MongoDB connection
├── models/
│   ├── User.js
│   ├── Trip.js
│   ├── TripMember.js
│   ├── Expense.js
│   └── Settlement.js
├── middleware/
│   └── auth.js               # JWT protect middleware
├── controllers/
│   ├── authController.js     # register, login
│   ├── tripController.js     # create/join/end trip, members
│   ├── locationController.js # REST fallback for location updates
│   ├── expenseController.js  # add expense, split summary
│   └── sosController.js      # trigger/clear SOS
├── routes/
│   ├── authRoutes.js
│   ├── tripRoutes.js
│   ├── locationRoutes.js
│   ├── expenseRoutes.js
│   └── sosRoutes.js
├── sockets/
│   └── socketHandler.js      # all Socket.IO events, JWT-authenticated
├── utils/
│   ├── geo.js                # haversine distance calculation
│   └── settlement.js         # minimum-transaction settlement algorithm
├── server.js                 # app entry point
├── .env.example
└── package.json
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```
   - `MONGO_URI`: your MongoDB Atlas connection string
   - `JWT_SECRET`: any long random string
   - `SEPARATION_ALERT_KM`: default distance threshold for separation alerts

3. Run in development (auto-restart on changes):
   ```bash
   npm run dev
   ```
   Or in production:
   ```bash
   npm start
   ```

4. Health check: `GET http://localhost:5000/` should return `{ status: "ok" }`.

## REST API Reference

| Method | Endpoint                     | Auth | Description |
|--------|-------------------------------|------|--------------|
| POST   | `/api/register`               | No   | Create account |
| POST   | `/api/login`                  | No   | Login, returns JWT |
| POST   | `/api/trip/create`            | Yes  | Create a trip room, returns join code |
| POST   | `/api/trip/join`               | Yes  | Join a trip via join code |
| GET    | `/api/trip/:tripId/members`    | Yes  | List active members |
| POST   | `/api/trip/:tripId/end`        | Yes  | End trip (owner only) |
| POST   | `/api/location/update`         | Yes  | Update GPS location (REST fallback; prefer socket event) |
| POST   | `/api/expense/add`             | Yes  | Log a shared expense |
| GET    | `/api/expense/split?tripId=`   | Yes  | Get balances + minimum settlement transactions |
| POST   | `/api/sos`                     | Yes  | Trigger SOS, broadcasts to trip room |
| POST   | `/api/sos/clear`               | Yes  | Clear an active SOS |

All authenticated routes require header: `Authorization: Bearer <token>`.

## Socket.IO Events

Connect with `io(URL, { auth: { token: "<jwt>" } })`. The socket connection itself is JWT-authenticated (see `sockets/socketHandler.js`).

| Event (client → server) | Payload | Description |
|--------------------------|---------|--------------|
| `joinRoom`               | `{ tripId }` | Join a trip's socket room |
| `leaveRoom`              | `{ tripId }` | Leave a trip's socket room |
| `locationUpdate`         | `{ tripId, lat, lng }` | Broadcast live GPS position; triggers separation check |
| `sendSOS`                | `{ tripId, lat, lng }` | Broadcast emergency alert |
| `expenseAdded`           | `{ tripId, expense }` | Notify room of a new expense (after REST call) |
| `tripEnded`              | `{ tripId }` | Notify room the trip ended |

| Event (server → client) | Payload | Description |
|--------------------------|---------|--------------|
| `memberJoined`           | `{ userId, tripId }` | Someone joined the room |
| `memberLeft`             | `{ userId, tripId }` | Someone left the room |
| `locationUpdate`         | `{ userId, lat, lng, updatedAt }` | A member's new position |
| `separationAlert`        | `{ userId, message }` | A member has crossed the distance threshold |
| `sosTriggered`           | `{ userId, lat, lng, triggeredAt }` | Emergency broadcast |
| `sosCleared`             | `{ userId }` | Emergency cleared |
| `expenseAdded`           | `{ expense }` | New expense logged |
| `tripEnded`              | `{ tripId }` | Trip has ended |

## Notes / Next Steps
- Add rate limiting (e.g. `express-rate-limit`) on `/api/register` and `/api/login`.
- Add input validation (e.g. `zod` or `express-validator`) on all POST bodies.
- Add a `Chat` model + socket events if you want the optional group chat feature.
- Add refresh tokens if you want longer-lived mobile sessions without re-login.
- Write integration tests (Jest + Supertest) for each route before connecting the mobile app.
- Once this is running, the React Native (Expo) frontend can consume these REST endpoints and socket events directly.
