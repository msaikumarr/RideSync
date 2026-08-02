const Trip = require('../models/Trip');
const TripMember = require('../models/TripMember');

// POST /trip/create
const createTrip = async (req, res) => {
  try {
    const { name, description, separationThresholdKm, plannedRoute, destination } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Trip name is required' });
    }

    const trip = await Trip.create({
      name,
      description,
      createdBy: req.user.id,
      separationThresholdKm: separationThresholdKm || 2,
      plannedRoute: plannedRoute || [],
      destination: destination || undefined
    });

    await TripMember.create({
      trip: trip._id,
      user: req.user.id,
      role: 'owner'
    });

    res.status(201).json({ trip });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create trip', error: err.message });
  }
};

// GET /trip/active
// Returns the caller's currently active trip (if any), so the app can "resume"
// into it after navigating away, instead of losing track of it.
const getActiveTrip = async (req, res) => {
  try {
    const memberships = await TripMember.find({ user: req.user.id, leftAt: null }).populate({
      path: 'trip',
      match: { status: 'active' }
    });

    const activeMembership = memberships.find((m) => m.trip);

    if (!activeMembership) {
      return res.status(200).json({ trip: null });
    }

    res.status(200).json({ trip: activeMembership.trip });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch active trip', error: err.message });
  }
};

// GET /trip/history
// Returns every trip the caller has ever been part of, most recent first.
const getTripHistory = async (req, res) => {
  try {
    const memberships = await TripMember.find({ user: req.user.id })
      .populate('trip')
      .sort({ createdAt: -1 });

    const trips = memberships.filter((m) => m.trip).map((m) => ({ ...m.trip.toObject(), myRole: m.role }));

    res.status(200).json({ trips });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch trip history', error: err.message });
  }
};

// POST /trip/join
const joinTrip = async (req, res) => {
  try {
    const { joinCode } = req.body;

    if (!joinCode) {
      return res.status(400).json({ message: 'Join code is required' });
    }

    const trip = await Trip.findOne({ joinCode: joinCode.toUpperCase(), status: 'active' });
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or has ended' });
    }

    const existingMember = await TripMember.findOne({ trip: trip._id, user: req.user.id });
    if (existingMember) {
      return res.status(200).json({ message: 'Already a member of this trip', trip });
    }

    await TripMember.create({
      trip: trip._id,
      user: req.user.id,
      role: 'member'
    });

    res.status(200).json({ message: 'Joined trip successfully', trip });
  } catch (err) {
    res.status(500).json({ message: 'Failed to join trip', error: err.message });
  }
};

// GET /trip/:tripId/members
const getTripMembers = async (req, res) => {
  try {
    const { tripId } = req.params;
    const members = await TripMember.find({ trip: tripId, leftAt: null }).populate(
      'user',
      'name email phone'
    );
    res.status(200).json({ members });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch trip members', error: err.message });
  }
};

// POST /trip/:tripId/end
const endTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (String(trip.createdBy) !== req.user.id) {
      return res.status(403).json({ message: 'Only the trip owner can end the trip' });
    }

    trip.status = 'ended';
    trip.endedAt = new Date();
    await trip.save();

    res.status(200).json({ message: 'Trip ended', trip });
  } catch (err) {
    res.status(500).json({ message: 'Failed to end trip', error: err.message });
  }
};

// DELETE /trip/:tripId/history
// Removes the trip from the CALLER's own history view only (deletes their
// TripMember record). It does not touch the underlying Trip, Expenses, or
// other members' records — so this can't be used to wipe a trip out from
// under people who are still relying on it. Only allowed once a trip has
// ended, so people can't accidentally hide a trip they're still actively on.
const removeFromHistory = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.status === 'active') {
      return res.status(400).json({
        message: 'This trip is still active. End it before removing it from your history.'
      });
    }

    const membership = await TripMember.findOneAndDelete({ trip: tripId, user: req.user.id });
    if (!membership) {
      return res.status(404).json({ message: 'You were not part of this trip' });
    }

    res.status(200).json({ message: 'Trip removed from your history' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove trip', error: err.message });
  }
};

module.exports = {
  createTrip,
  joinTrip,
  getTripMembers,
  endTrip,
  getActiveTrip,
  getTripHistory,
  removeFromHistory
};
