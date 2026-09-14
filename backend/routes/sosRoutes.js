const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { triggerSOS, clearSOS, getSosHistory } = require('../controllers/sosController');

router.post('/', protect, triggerSOS);
router.post('/clear', protect, clearSOS);
router.get('/history/:tripId', protect, getSosHistory);

module.exports = router;
