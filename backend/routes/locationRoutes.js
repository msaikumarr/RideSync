const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { updateLocation } = require('../controllers/locationController');

router.post('/update', protect, updateLocation);

module.exports = router;
