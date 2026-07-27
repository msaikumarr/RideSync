const TripMember = require('../models/TripMember');

// POST /sos
// Body: { tripId, lat, lng }
const triggerSOS = async (req, res) => {
  try {
    const { tripId, lat, lng } = req.body;

    if (!tripId || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'tripId, lat and lng are required' });
    }

    const member = await TripMember.findOne({ trip: tripId, user: req.user.id, leftAt: null });
    if (!member) {
      return res.status(404).json({ message: 'You are not an active member of this trip' });
    }

    member.sos = { active: true, triggeredAt: new Date(), lat, lng };
    await member.save();

    // Broadcast to trip room via Socket.IO (io instance attached to app in server.js)
    const io = req.app.get('io');
    if (io) {
      io.to(`trip:${tripId}`).emit('sosTriggered', {
        userId: req.user.id,
        lat,
        lng,
        triggeredAt: member.sos.triggeredAt
      });
    }

    res.status(200).json({ message: 'SOS broadcasted to trip members', sos: member.sos });
  } catch (err) {
    res.status(500).json({ message: 'Failed to trigger SOS', error: err.message });
  }
};

// POST /sos/clear
const clearSOS = async (req, res) => {
  try {
    const { tripId } = req.body;

    const member = await TripMember.findOne({ trip: tripId, user: req.user.id, leftAt: null });
    if (!member) {
      return res.status(404).json({ message: 'You are not an active member of this trip' });
    }

    member.sos = { active: false, triggeredAt: null, lat: null, lng: null };
    await member.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`trip:${tripId}`).emit('sosCleared', { userId: req.user.id });
    }

    res.status(200).json({ message: 'SOS cleared' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear SOS', error: err.message });
  }
};

module.exports = { triggerSOS, clearSOS };
