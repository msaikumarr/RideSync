const mongoose = require('mongoose');

// A durable log of every SOS trigger/clear, independent of TripMember.sos
// (which only ever holds the *current* state). This is what lets Trip
// Summary/History later report a real "number of SOS events" instead of a
// guess — see RideSync_Complete_Project_Documentation section 21 & 26.
const sosEventSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' },
    triggeredAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date }
  },
  { timestamps: true }
);

sosEventSchema.index({ trip: 1, triggeredAt: -1 });

module.exports = mongoose.model('SosEvent', sosEventSchema);
