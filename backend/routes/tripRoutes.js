const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createTrip, joinTrip, getTripMembers, endTrip } = require('../controllers/tripController');

router.post('/create', protect, createTrip);
router.post('/join', protect, joinTrip);
router.get('/:tripId/members', protect, getTripMembers);
router.post('/:tripId/end', protect, endTrip);

module.exports = router;
