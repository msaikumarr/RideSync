# RideSync

Smart Group Ride Companion — a React Native (Expo) mobile app with a Node.js/Express + Socket.IO backend for live group location sharing, separation alerts, SOS, and shared expense settlement during group trips.

## Structure

```
RideSync/
├── backend/    # Express REST API + Socket.IO real-time engine (see backend/README.md)
├── frontend/   # Expo/React Native mobile app (see frontend/README.md)
└── render.yaml # Render Blueprint for backend deployment
```

## Stack

- **Backend**: Node.js, Express, Socket.IO, MongoDB Atlas + Mongoose, JWT auth
- **Frontend**: React Native + Expo (SDK 51), React Navigation, Leaflet/OpenStreetMap (WebView), expo-location, socket.io-client

## Features

- Create/join a trip room via a join code, with live group location on a map
- Separation alerts when a member drifts beyond a configurable distance
- One-tap SOS broadcast to the trip group
- Shared expense logging with minimum-transaction settlement

## Getting Started

See [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md) for setup, environment variables, and the API/socket reference.

## Deployment

- **Backend**: deployed on [Render](https://render.com) using the Blueprint at [`render.yaml`](render.yaml) (New → Blueprint → pick this repo). Live at `https://ridesync-backend-cf67.onrender.com`.
- **Frontend**: built with [EAS Build](https://docs.expo.dev/build/introduction/). The `preview` profile in `frontend/eas.json` produces an installable Android APK pointed at the live Render backend:
  ```bash
  cd frontend
  npx eas-cli build --platform android --profile preview
  ```
