const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendMail } = require('../utils/mail');
const { generateOtp, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS } = require('../utils/otp');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const sendOtpEmail = async (to, name, otp) => {
  await sendMail({
    to,
    subject: 'Your RideSync verification code',
    text: `Hi ${name || 'there'},\n\nYour verification code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Hi ${name || 'there'},</p><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;">${otp}</p><p>It expires in ${OTP_EXPIRY_MINUTES} minutes.</p><p>If you didn't request this, you can ignore this email.</p>`
  });
};

// POST /register
// Creates the account in an unverified state and emails a 6-digit OTP —
// nothing is usable (no token issued) until POST /verify-otp succeeds.
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const trimmedPhone = phone?.trim();
    const normalizedEmail = email?.toLowerCase().trim();

    if (!name || !normalizedEmail || !password || !trimmedPhone) {
      return res.status(400).json({ message: 'Name, email, password and phone are required' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser?.isVerified) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    const otpCodeHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    let user;
    if (existingUser) {
      // An unverified leftover from an abandoned signup — refresh it with a
      // new code instead of permanently blocking this email address.
      existingUser.name = name;
      existingUser.password = hashedPassword;
      existingUser.phone = trimmedPhone;
      existingUser.otpCodeHash = otpCodeHash;
      existingUser.otpExpiresAt = otpExpiresAt;
      existingUser.otpAttempts = 0;
      user = await existingUser.save();
    } else {
      user = await User.create({
        name,
        email: normalizedEmail,
        password: hashedPassword,
        phone: trimmedPhone,
        otpCodeHash,
        otpExpiresAt,
        otpAttempts: 0
      });
    }

    try {
      await sendOtpEmail(user.email, user.name, otp);
    } catch (mailErr) {
      // The account is already created — don't fail registration over a
      // flaky SMTP connection. The user can retry via "Resend OTP".
      console.error('Failed to send OTP email during registration:', mailErr.message || mailErr);
    }

    res.status(201).json({
      message: 'Registration successful. Enter the OTP sent to your email to verify your account.',
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

// POST /send-otp
// Resends a verification code — used both for "didn't get the code" and to
// give a not-yet-verified user a fresh code when they try to log in.
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'No account found for that email' });
    }

    if (user.isVerified) {
      return res.status(200).json({ message: 'This account is already verified. You can log in.' });
    }

    const otp = generateOtp();
    user.otpCodeHash = await bcrypt.hash(otp, 10);
    user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    try {
      await sendOtpEmail(user.email, user.name, otp);
    } catch (mailErr) {
      console.error('Failed to send OTP email on resend:', mailErr.message || mailErr);
      return res.status(502).json({ message: 'Could not send verification email. Please try again shortly.' });
    }

    res.status(200).json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not send verification code', error: err.message });
  }
};

// POST /verify-otp
// Success activates the account and logs the user in (issues a token),
// matching the documented flow: Register -> Verify OTP -> Create/activate
// account -> Login.
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'No account found for that email' });
    }

    if (user.isVerified) {
      // Already verified (double-tapped Verify, or verified on another
      // device) — log them in instead of showing a dead-end error.
      const token = generateToken(user);
      return res.status(200).json({
        token,
        user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
      });
    }

    if (!user.otpCodeHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'This code has expired. Request a new one.' });
    }

    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      user.otpCodeHash = undefined;
      user.otpExpiresAt = undefined;
      await user.save();
      return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
    }

    const isMatch = await bcrypt.compare(otp, user.otpCodeHash);
    if (!isMatch) {
      user.otpAttempts += 1;
      await user.save();
      const remaining = MAX_OTP_ATTEMPTS - user.otpAttempts;
      return res.status(400).json({
        message:
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Incorrect code. Request a new one.'
      });
    }

    user.isVerified = true;
    user.otpCodeHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    await user.save();

    const token = generateToken(user);
    res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not verify code', error: err.message });
  }
};

// POST /login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in.',
        requiresVerification: true,
        email: user.email
      });
    }

    const token = generateToken(user);

    res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword
};

// GET /me
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password -resetPasswordToken -resetPasswordExpires');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Could not load profile', error: err.message });
  }
}

// PUT /me
async function updateProfile(req, res) {
  try {
    const { name, phone, emergencyContact } = req.body;
    const trimmedPhone = phone?.trim();

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name !== undefined) user.name = name;
    if (phone !== undefined) {
      if (!trimmedPhone) {
        return res.status(400).json({ message: 'Phone is required' });
      }

      user.phone = trimmedPhone;
    }
    if (emergencyContact !== undefined) {
      user.emergencyContact = {
        name: emergencyContact.name || undefined,
        phone: emergencyContact.phone || undefined
      };
    }

    await user.save();

    res.status(200).json({
      message: 'Profile updated',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emergencyContact: user.emergencyContact
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not update profile', error: err.message });
  }
}

// POST /change-password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Could not change password', error: err.message });
  }
}

// POST /forgot-password
// NOTE: This project has no email service wired up yet. In place of emailing
// a reset link, the token is returned directly in the API response so the
// flow can be tested end-to-end during development. Before shipping this to
// real users, swap the response for an actual email send and stop returning
// the token to the client.
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return 200 even if the user doesn't exist, so this endpoint
    // can't be used to discover which emails are registered.
    if (!user) {
      return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    res.status(200).json({
      message: 'If that email exists, a reset link has been sent.',
      devToken: token // dev-only, see note above
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not process request', error: err.message });
  }
}

// POST /reset-password
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not reset password', error: err.message });
  }
}
