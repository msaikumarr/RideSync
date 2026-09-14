const TripMember = require('../models/TripMember');
const Notification = require('../models/Notification');

// Persists one notification per recipient and, if a Socket.IO instance is
// given, pushes a live 'notification' event to the trip room so an open app
// updates immediately instead of waiting for the next GET /api/notifications.
const createNotifications = async ({ userIds, tripId, type, message, io }) => {
  const uniqueIds = [...new Set((userIds || []).map(String))];
  if (uniqueIds.length === 0) return;

  await Notification.insertMany(
    uniqueIds.map((userId) => ({ user: userId, trip: tripId, type, message }))
  );

  if (io && tripId) {
    io.to(`trip:${tripId}`).emit('notification', { tripId, type, message });
  }
};

// Notifies every currently-active member of a trip, optionally leaving out
// the member who caused the event (they already know — they just did it).
const notifyTrip = async ({ tripId, type, message, excludeUserId, io }) => {
  const members = await TripMember.find({ trip: tripId, leftAt: null }).select('user');
  const userIds = members
    .map((m) => String(m.user))
    .filter((id) => !excludeUserId || id !== String(excludeUserId));

  await createNotifications({ userIds, tripId, type, message, io });
};

module.exports = { createNotifications, notifyTrip };
