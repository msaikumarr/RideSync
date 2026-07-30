const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendMail } = require('../utils/mail');
const User = require('../models/User');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// POST /register
const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
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

    const token = generateToken(user);

    res.status(200).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

// POST /forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always respond with a generic message to avoid leaking which emails are registered
    const genericMsg = 'If an account exists, a reset email was sent.';
    if (!user) return res.status(200).json({ message: genericMsg });

    const MAX_RESET_ATTEMPTS = parseInt(process.env.MAX_RESET_ATTEMPTS || '5', 10);
    const RESET_LOCK_MINUTES = parseInt(process.env.RESET_LOCK_MINUTES || '60', 10);

    // check for lockout
    if (user.resetLockedUntil && user.resetLockedUntil > Date.now()) {
      const retryMinutes = Math.ceil((user.resetLockedUntil - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many reset attempts. Try again in ${retryMinutes} minute(s).` });
    }

    // increment attempts and possibly lock
    user.resetAttempts = (user.resetAttempts || 0) + 1;
    if (user.resetAttempts >= MAX_RESET_ATTEMPTS) {
      user.resetLockedUntil = Date.now() + RESET_LOCK_MINUTES * 60000;
      user.resetAttempts = 0;
      await user.save();
      return res.status(429).json({ message: `Too many reset attempts. Try again in ${RESET_LOCK_MINUTES} minutes.` });
    }

    // generate 6-digit numeric OTP
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    // reset attempt counter on successful OTP generation
    user.resetAttempts = 0;
    user.resetLockedUntil = undefined;
    await user.save();

    const mailText = `Your RideSync password reset OTP is: ${token}\n\nEnter this code in the password reset screen. This OTP expires in 1 hour. If you didn't request this, ignore.`;

    // send email (do not fail on email errors)
    try {
      await sendMail({ to: user.email, subject: 'RideSync Password Reset - OTP', text: mailText });
    } catch (mailErr) {
      console.error('Forgot password email error:', mailErr.message || mailErr);
    }

    return res.status(200).json({ message: genericMsg });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to process forgot password', error: err.message });
  }
};

// POST /reset-password
const resetPassword = async (req, res) => {
  try {
    const { password, resetJwt } = req.body;
    if (!password || !resetJwt) return res.status(400).json({ message: 'Reset token and new password are required' });

    let user;

    try {
      const payload = jwt.verify(resetJwt, process.env.JWT_SECRET);
      if (payload?.purpose !== 'reset' || !payload?.id) return res.status(400).json({ message: 'Invalid reset token' });
      user = await User.findById(payload.id);
      if (!user) return res.status(400).json({ message: 'Invalid reset token' });
      if (!user.resetPasswordToken || !user.resetPasswordExpires || user.resetPasswordExpires < Date.now()) {
        return res.status(400).json({ message: 'OTP expired or invalid' });
      }
    } catch (e) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    // clear attempt counters / lock state
    user.resetAttempts = 0;
    user.resetLockedUntil = undefined;
    await user.save();

    return res.status(200).json({ message: 'Password has been reset' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to reset password', error: err.message });
  }
};

// POST /verify-otp
const verifyOtp = async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) return res.status(400).json({ message: 'Email and token are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: 'Invalid token' });

    if (!user.resetPasswordToken || user.resetPasswordToken !== String(token) || !user.resetPasswordExpires || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // issue short-lived reset JWT
    const resetJwt = jwt.sign({ id: user._id, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: process.env.RESET_JWT_EXPIRES || '15m' });

    return res.status(200).json({ message: 'OTP verified', resetJwt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to verify OTP', error: err.message });
  }
};

module.exports = { register, login, forgotPassword, verifyOtp, resetPassword };