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
    sos: {
      active: { type: Boolean, default: false },
      triggeredAt: { type: Date },
      lat: { type: Number },
      lng: { type: Number }
    },
    isSeparated: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date }
  },
  { timestamps: true }
);

tripMemberSchema.index({ trip: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('TripMember', tripMemberSchema);
