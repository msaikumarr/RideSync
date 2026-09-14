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
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    // Hashed like a password (bcrypt) rather than stored in plaintext, even
    // though it's short-lived — see controllers/authController.js.
    otpCodeHash: { type: String },
    otpExpiresAt: { type: Date },
    otpAttempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
