const mongoose = require('mongoose');

const tripMemberSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    lastLocation: {
      lat: { type: Number },
      lng: { type: Number },
      updatedAt: { type: Date }
    },
    // Running sum of haversine deltas between consecutive location updates —
    // this member's actual traveled distance, not a straight-line estimate.
    // See services/locationService.js for how it's accumulated.
    distanceTraveledKm: { type: Number, default: 0 },
    sos: {
      active: { type: Boolean, default: false },
      triggeredAt: { type: Date },
      lat: { type: Number },
      lng: { type: Number }
    },
    isSeparated: { type: Boolean, default: false },
    groupStatus: {
      type: String,
      enum: ['together', 'getting_separated', 'separated'],
      default: 'together'
    },
    distanceFromGroupKm: { type: Number },
    // Set when a member first measures beyond the separation threshold;
    // cleared once they're back within it or once separation is confirmed.
    // See services/separationService.js.
    separationPendingSince: { type: Date },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date }
  },
  { timestamps: true }
);

tripMemberSchema.index({ trip: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('TripMember', tripMemberSchema);
