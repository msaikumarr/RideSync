const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, required: true, trim: true },
    emergencyContact: {
      name: { type: String },
      phone: { type: String }
    },
    isVerified: { type: Boolean, default: false },
    // Hashed like a password (bcrypt) rather than stored in plaintext, even
    // though it's short-lived — see controllers/authController.js.
    otpCodeHash: { type: String },
    otpExpiresAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    // Separate OTP fields for the forgot-password flow, so a pending
    // password reset can't collide with a pending registration verification.
    resetOtpHash: { type: String },
    resetOtpExpiresAt: { type: Date },
    resetOtpAttempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
