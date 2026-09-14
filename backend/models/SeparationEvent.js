const mongoose = require('mongoose');

// One row per *confirmed* separation (see services/separationService.js —
// confirmation requires staying beyond threshold for SEPARATION_CONFIRM_WINDOW_MS,
// so this never logs a single GPS spike). This is what lets Trip Summary
// report a real "number of separation events" instead of a guess.
const separationEventSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    distanceFromGroupKm: { type: Number, required: true },
    occurredAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

separationEventSchema.index({ trip: 1, occurredAt: -1 });

module.exports = mongoose.model('SeparationEvent', separationEventSchema);
