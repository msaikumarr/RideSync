const TripMember = require('../models/TripMember');
const { distanceKm } = require('../utils/geo');

// A single GPS jump implying more than this many km of travel since the last
// fix is treated as a glitch (cold start, wifi-based location snapping,
// tunnel exit) rather than real movement, and isn't added to the odometer.
const MAX_PLAUSIBLE_JUMP_KM = 5;

// Updates a member's current position and, if there's a previous fix to
// compare against, adds the real distance moved to their running total —
// this is what makes Trip Summary's "total distance" a real, stored metric
// instead of an estimate. Shared by the REST location-update endpoint and
// the Socket.IO handler so both paths keep one consistent odometer.
const recordLocationUpdate = async ({ tripId, userId, lat, lng, batteryLevel }) => {
  const member = await TripMember.findOne({ trip: tripId, user: userId, leftAt: null });
  if (!member) return null;

  const previous = member.lastLocation;
  if (previous?.lat !== undefined && previous?.lng !== undefined) {
    const delta = distanceKm(previous.lat, previous.lng, lat, lng);
    if (delta <= MAX_PLAUSIBLE_JUMP_KM) {
      member.distanceTraveledKm = (member.distanceTraveledKm || 0) + delta;
    }
  }

  member.lastLocation = { lat, lng, updatedAt: new Date() };
  if (typeof batteryLevel === 'number') {
    member.batteryLevel = batteryLevel;
  }
  await member.save();

  return member;
};

module.exports = { recordLocationUpdate, MAX_PLAUSIBLE_JUMP_KM };
