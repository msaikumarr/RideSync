const jwt = require('jsonwebtoken');
const TripMember = require('../models/TripMember');
const { recordLocationUpdate } = require('../services/locationService');
const { evaluateMemberSeparation } = require('../services/separationService');

// Verifies the JWT sent by the client during socket handshake
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication error: no token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    next(new Error('Authentication error: invalid token'));
  }
};

const registerSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.user.id})`);

    // joinRoom: client joins a trip room
    socket.on('joinRoom', async ({ tripId }) => {
      socket.join(`trip:${tripId}`);
      socket.data.tripId = tripId;

      io.to(`trip:${tripId}`).emit('memberJoined', { userId: socket.user.id, tripId });
    });

    // leaveRoom: client leaves a trip room
    socket.on('leaveRoom', async ({ tripId }) => {
      socket.leave(`trip:${tripId}`);
      io.to(`trip:${tripId}`).emit('memberLeft', { userId: socket.user.id, tripId });
    });

    // locationUpdate: real-time GPS broadcast + separation check
    socket.on('locationUpdate', async ({ tripId, lat, lng }) => {
      try {
        const member = await recordLocationUpdate({ tripId, userId: socket.user.id, lat, lng });

        if (!member) return;

        const result = await evaluateMemberSeparation({ tripId, userId: socket.user.id, lat, lng, io });

        // Broadcast this member's new location (plus their current
        // distance/status from the group) to the rest of the room. If
        // separation was just confirmed, evaluateMemberSeparation already
        // broadcast 'separationAlert' and persisted notifications itself.
        io.to(`trip:${tripId}`).emit('locationUpdate', {
          userId: socket.user.id,
          lat,
          lng,
          updatedAt: member.lastLocation.updatedAt,
          distanceFromGroupKm: result?.distanceFromGroupKm,
          groupStatus: result?.groupStatus
        });
      } catch (err) {
        console.error('locationUpdate error:', err.message);
      }
    });

    // sendSOS: emergency broadcast
    socket.on('sendSOS', async ({ tripId, lat, lng }) => {
      try {
        const member = await TripMember.findOneAndUpdate(
          { trip: tripId, user: socket.user.id, leftAt: null },
          { sos: { active: true, triggeredAt: new Date(), lat, lng } },
          { new: true }
        );

        if (!member) return;

        io.to(`trip:${tripId}`).emit('sosTriggered', {
          userId: socket.user.id,
          lat,
          lng,
          triggeredAt: member.sos.triggeredAt
        });
      } catch (err) {
        console.error('sendSOS error:', err.message);
      }
    });

    // expenseAdded: notify room that a new expense was logged (REST call does the DB write)
    socket.on('expenseAdded', ({ tripId, expense }) => {
      io.to(`trip:${tripId}`).emit('expenseAdded', { expense });
    });

    // tripEnded: notify room the trip has ended
    socket.on('tripEnded', ({ tripId }) => {
      io.to(`trip:${tripId}`).emit('tripEnded', { tripId });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id} (user ${socket.user.id})`);
    });
  });
};

module.exports = registerSocketHandlers;
