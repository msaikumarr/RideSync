const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
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
    const trimmedPhone = phone?.trim();

    if (!name || !email || !password || !trimmedPhone) {
      return res.status(400).json({ message: 'Name, email, password and phone are required' });
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
      phone: trimmedPhone
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

module.exports = {
  register,
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
