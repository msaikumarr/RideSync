const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

// crypto.randomInt (not Math.random) — this code gates account access, so it
// needs to be unguessable, not just look random.
const generateOtp = () => String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

module.exports = { generateOtp, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS };
