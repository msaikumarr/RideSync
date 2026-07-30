const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    emergencyContact: {
      name: { type: String },
      phone: { type: String }
    }
    ,
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    // track OTP request attempts to mitigate abuse
    resetAttempts: { type: Number, default: 0 },
    resetLockedUntil: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
