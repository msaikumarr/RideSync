const TripMember = require('../models/TripMember');
const SosEvent = require('../models/SosEvent');
const User = require('../models/User');
const { notifyTrip } = require('../services/notificationService');

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

    await SosEvent.create({
      trip: tripId,
      user: req.user.id,
      lat,
      lng,
      status: 'active',
      triggeredAt: member.sos.triggeredAt
    });

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

    const triggeringUser = await User.findById(req.user.id).select('name');
    await notifyTrip({
      tripId,
      type: 'sos_alert',
      message: `${triggeringUser?.name || 'A trip member'} triggered an SOS alert!`,
      excludeUserId: req.user.id,
      io
    });

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

    const resolvedAt = new Date();
    await SosEvent.findOneAndUpdate(
      { trip: tripId, user: req.user.id, status: 'active' },
      { status: 'resolved', resolvedAt },
      { sort: { triggeredAt: -1 } }
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`trip:${tripId}`).emit('sosCleared', { userId: req.user.id });
    }

    res.status(200).json({ message: 'SOS cleared' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear SOS', error: err.message });
  }
};

// GET /sos/history/:tripId
// Full SOS history for a trip (active + resolved), most recent first —
// the source of truth for "number of SOS events" in Trip Summary/History.
const getSosHistory = async (req, res) => {
  try {
    const { tripId } = req.params;

    const member = await TripMember.findOne({ trip: tripId, user: req.user.id });
    if (!member) {
      return res.status(403).json({ message: 'You are not a member of this trip' });
    }

    const events = await SosEvent.find({ trip: tripId })
      .sort({ triggeredAt: -1 })
      .populate('user', 'name');

    res.status(200).json({ events });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch SOS history', error: err.message });
  }
};

module.exports = { triggerSOS, clearSOS, getSosHistory };
