const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  register,
  sendOtp,
  verifyOtp,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword
} = require('../controllers/authController');

router.post('/register', register);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', protect, getProfile);
router.put('/me', protect, updateProfile);
router.post('/change-password', protect, changePassword);

module.exports = router;
