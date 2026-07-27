const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { triggerSOS, clearSOS } = require('../controllers/sosController');

router.post('/', protect, triggerSOS);
router.post('/clear', protect, clearSOS);

module.exports = router;
