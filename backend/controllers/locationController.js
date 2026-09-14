const { recordLocationUpdate } = require('../services/locationService');
const { evaluateMemberSeparation } = require('../services/separationService');

// POST /location/update
// Body: { tripId, lat, lng }
// Also emits socket events if io/socket handler is wired in (see sockets/socketHandler.js)
const updateLocation = async (req, res) => {
  try {
    const { tripId, lat, lng } = req.body;

    if (!tripId || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'tripId, lat and lng are required' });
    }

    const member = await recordLocationUpdate({ tripId, userId: req.user.id, lat, lng });
    if (!member) {
      return res.status(404).json({ message: 'You are not an active member of this trip' });
    }

    const result = await evaluateMemberSeparation({
      tripId,
      userId: req.user.id,
      lat,
      lng,
      io: req.app.get('io')
    });

    res.status(200).json({
      message: 'Location updated',
      location: member.lastLocation,
      groupStatus: result?.groupStatus,
      distanceFromGroupKm: result?.distanceFromGroupKm,
      separated: result?.isSeparated || false
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update location', error: err.message });
  }
};

module.exports = { updateLocation };
