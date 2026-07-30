# RideSync Frontend (React Native / Expo)

Mobile app for **RideSync – Smart Group Ride Companion**. Talks to the `ridesync-backend` API and Socket.IO server.

## Stack
- React Native + Expo (SDK 51)
- React Navigation (native stack)
- react-native-maps (live group map)
- expo-location (foreground GPS tracking)
- expo-secure-store (JWT storage)
- socket.io-client (real-time location, SOS, alerts)
- axios (REST calls)

## Project Structure
```
ridesync-frontend/
├── App.js                       # entry point, wraps app in AuthProvider
├── app.json                     # Expo config (permissions, bundle IDs)
├── babel.config.js
├── .env.example
├── package.json
└── src/
    ├── api/
    │   └── client.js             # axios instance + JWT interceptor + API groups
    ├── context/
    │   └── AuthContext.js        # global auth state, login/register/logout, connects socket
    ├── navigation/
    │   └── AppNavigator.js       # switches between auth stack and app stack
    ├── screens/
    │   ├── LoginScreen.js
    │   ├── RegisterScreen.js
    │   ├── HomeScreen.js         # create/join trip
    │   ├── TripMapScreen.js      # live map, location sharing, separation alerts, SOS
    │   └── ExpensesScreen.js     # add expense + settlement summary
    ├── components/
    │   └── SOSButton.js          # confirm + trigger emergency SOS
    └── utils/
        ├── storage.js            # SecureStore wrapper for token/user
        └── socket.js             # socket.io-client singleton, JWT-authenticated
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Point the app at your backend. Update the base URLs in:
   - `src/api/client.js` → `API_BASE_URL`
   - `src/utils/socket.js` → `SOCKET_URL`

   By default both point to `http://localhost:5000`. If you're testing on a physical
   device, use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.10:5000`).

3. Start the dev server:
   ```bash
   npx expo start
   ```
   Scan the QR code with Expo Go (Android/iOS) or press `a` / `i` for an emulator.

## How the pieces connect to the backend

- **Auth**: `LoginScreen` / `RegisterScreen` call `authAPI`, which hits `/api/login` and
  `/api/register`. On success, the JWT + user are saved via `SecureStore` and the socket
  connects with that token (`connectSocket`).
- **Trip rooms**: `HomeScreen` calls `tripAPI.create` / `tripAPI.join`, matching
  `POST /api/trip/create` and `POST /api/trip/join`.
- **Live map**: `TripMapScreen` emits `joinRoom` on mount, then streams the device's
  position via `Location.watchPositionAsync` over the `locationUpdate` socket event.
  It listens for `locationUpdate`, `separationAlert`, `sosTriggered`, and `sosCleared`
  from other members.
- **SOS**: `SOSButton` grabs the current position and calls `POST /api/sos`, which the
  backend broadcasts to the trip room over Socket.IO.
- **Expenses**: `ExpensesScreen` calls `expenseAPI.add` (`POST /api/expense/add`) and
  `expenseAPI.split` (`GET /api/expense/split`) to show the minimum settlement summary.

## Next Steps
- Add background location tracking (`expo-location` background permissions are already
  declared in `app.json`, but `Location.startLocationUpdatesAsync` with a defined task
  needs to be wired up for tracking while the app is backgrounded).
- Add a trip members list / avatars on the map screen.
- Add push notifications (Expo Notifications) for separation alerts and SOS when the
  app is backgrounded.
- Add the optional group chat screen + socket events once you're ready for it.
- Swap the hardcoded API/socket URLs for `expo-constants` + `.env` (e.g. via `dotenv`
  and `app.config.js`) before shipping.
