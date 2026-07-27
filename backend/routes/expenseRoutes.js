const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { addExpense, getSplitSummary } = require('../controllers/expenseController');

router.post('/add', protect, addExpense);
router.get('/split', protect, getSplitSummary);

module.exports = router;
