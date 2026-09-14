const TripMember = require('../models/TripMember');
const Trip = require('../models/Trip');
const User = require('../models/User');
const SeparationEvent = require('../models/SeparationEvent');
const { distanceKm } = require('../utils/geo');
const { formatDistance } = require('../utils/separation');
const { notifyTrip } = require('./notificationService');
const {
  GROUP_STATUS,
  SEPARATION_CONFIRM_WINDOW_MS,
  computeGroupCenter,
  classifyDistance
} = require('../utils/separation');

// Recomputes one member's distance from the group's reference point (the
// average position of every active, located member) and updates their group
// status. "Separated" is only confirmed once the member has stayed beyond
// the trip's threshold for SEPARATION_CONFIRM_WINDOW_MS, so a single GPS
// spike can't fire a false separation alert — see utils/separation.js.
//
// Shared by both the REST location-update endpoint and the Socket.IO
// locationUpdate handler so the two paths can never drift out of sync. When
// separation is freshly confirmed, this also broadcasts the socket alert and
// persists a notification for every other member — one place responsible
// for the whole "a member just became separated" event, instead of each
// caller building the alert message itself.
const evaluateMemberSeparation = async ({ tripId, userId, lat, lng, io }) => {
  const trip = await Trip.findById(tripId).select('separationThresholdKm');
  const thresholdKm = trip ? trip.separationThresholdKm : 2;

  const activeMembers = await TripMember.find({
    trip: tripId,
    leftAt: null,
    'lastLocation.lat': { $exists: true },
    'lastLocation.lng': { $exists: true }
  });

  const member = activeMembers.find((m) => String(m.user) === String(userId));
  if (!member) return null;

  const center = computeGroupCenter(activeMembers.map((m) => m.lastLocation));
  // A lone member (no one else located yet) has no group to be separated
  // from — leave them "together" rather than comparing against themself.
  if (!center || activeMembers.length < 2) {
    member.groupStatus = GROUP_STATUS.TOGETHER;
    member.distanceFromGroupKm = 0;
    member.isSeparated = false;
    member.separationPendingSince = undefined;
    await member.save();
    return {
      distanceFromGroupKm: 0,
      groupStatus: member.groupStatus,
      isSeparated: false,
      alertJustConfirmed: false
    };
  }

  const distanceFromGroupKm = distanceKm(lat, lng, center.lat, center.lng);
  const tier = classifyDistance(distanceFromGroupKm, thresholdKm);

  const now = new Date();
  let alertJustConfirmed = false;

  if (tier === GROUP_STATUS.SEPARATED) {
    if (member.isSeparated) {
      // Already confirmed separated on an earlier check — stays separated.
    } else if (!member.separationPendingSince) {
      member.separationPendingSince = now;
    } else if (now - member.separationPendingSince >= SEPARATION_CONFIRM_WINDOW_MS) {
      member.isSeparated = true;
      member.separationPendingSince = undefined;
      alertJustConfirmed = true;
    }
  } else {
    member.separationPendingSince = undefined;
    member.isSeparated = false;
  }

  member.groupStatus = member.isSeparated ? GROUP_STATUS.SEPARATED : tier;
  member.distanceFromGroupKm = distanceFromGroupKm;
  await member.save();

  if (alertJustConfirmed) {
    await SeparationEvent.create({ trip: tripId, user: userId, distanceFromGroupKm, occurredAt: now });

    const separatedUser = await User.findById(userId).select('name');
    const message = `${separatedUser?.name || 'A member'} is ${formatDistance(distanceFromGroupKm)} away from the group.`;

    if (io) {
      io.to(`trip:${tripId}`).emit('separationAlert', {
        userId,
        distanceFromGroupKm,
        message
      });
    }

    // The separated member already sees their own status on the map — this
    // is for everyone else who might not be looking right now.
    await notifyTrip({
      tripId,
      type: 'separation_warning',
      message,
      excludeUserId: userId,
      io
    });
  }

  return {
    distanceFromGroupKm,
    groupStatus: member.groupStatus,
    isSeparated: member.isSeparated,
    alertJustConfirmed
  };
};

module.exports = { evaluateMemberSeparation };
