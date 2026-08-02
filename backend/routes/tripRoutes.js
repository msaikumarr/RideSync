const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createTrip,
  joinTrip,
  getTripMembers,
  endTrip,
  getActiveTrip,
  getTripHistory,
  removeFromHistory
} = require('../controllers/tripController');

router.post('/create', protect, createTrip);
router.post('/join', protect, joinTrip);
router.get('/active', protect, getActiveTrip);
router.get('/history', protect, getTripHistory);
router.get('/:tripId/members', protect, getTripMembers);
router.post('/:tripId/end', protect, endTrip);
router.delete('/:tripId/history', protect, removeFromHistory);

module.exports = router;
