const mongoose = require('mongoose');

const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const tripSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinCode: { type: String, required: true, unique: true, default: generateJoinCode },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    separationThresholdKm: { type: Number, default: 2 },
    destination: {
      name: { type: String, trim: true },
      lat: { type: Number },
      lng: { type: Number }
    },
    plannedRoute: [
      {
        lat: Number,
        lng: Number
      }
    ],
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Trip', tripSchema);
module.exports.generateJoinCode = generateJoinCode;
  