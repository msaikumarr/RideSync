const TripMember = require('../models/TripMember');
const Trip = require('../models/Trip');
const { distanceKm } = require('../utils/geo');

// POST /location/update
// Body: { tripId, lat, lng }
// Also emits socket events if io/socket handler is wired in (see sockets/socketHandler.js)
const updateLocation = async (req, res) => {
  try {
    const { tripId, lat, lng } = req.body;

    if (!tripId || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'tripId, lat and lng are required' });
    }

    const member = await TripMember.findOne({ trip: tripId, user: req.user.id, leftAt: null });
    if (!member) {
      return res.status(404).json({ message: 'You are not an active member of this trip' });
    }

    member.lastLocation = { lat, lng, updatedAt: new Date() };
    await member.save();

    const trip = await Trip.findById(tripId);
    const threshold = trip ? trip.separationThresholdKm : 2;

    // Check separation against all other active members
    const otherMembers = await TripMember.find({
      trip: tripId,
      user: { $ne: req.user.id },
      leftAt: null,
      'lastLocation.lat': { $exists: true }
    });

    let separated = false;
    if (otherMembers.length > 0) {
      separated = otherMembers.every((other) => {
        const d = distanceKm(lat, lng, other.lastLocation.lat, other.lastLocation.lng);
        return d > threshold;
      });
    }

    member.isSeparated = separated;
    await member.save();

    res.status(200).json({
      message: 'Location updated',
      location: member.lastLocation,
      separated
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update location', error: err.message });
  }
};

module.exports = { updateLocation };
