const Expense = require('../models/Expense');
const TripMember = require('../models/TripMember');
const User = require('../models/User');
const { computeBalances, computeMinimumSettlements } = require('../utils/settlement');
const { createNotifications } = require('../services/notificationService');

// POST /expense/add
const addExpense = async (req, res) => {
  try {
    const { tripId, category, description, amount, splitAmong } = req.body;

    if (!tripId || !amount) {
      return res.status(400).json({ message: 'tripId and amount are required' });
    }

    let participants = splitAmong;
    if (!participants || participants.length === 0) {
      const members = await TripMember.find({ trip: tripId, leftAt: null });
      participants = members.map((m) => m.user);
    }

    const expense = await Expense.create({
      trip: tripId,
      paidBy: req.user.id,
      category: category || 'other',
      description,
      amount,
      splitAmong: participants
    });

    // Only the people actually splitting this expense need to know about it —
    // not everyone on the trip, if a subset was chosen.
    const payer = await User.findById(req.user.id).select('name');
    await createNotifications({
      userIds: participants.filter((id) => String(id) !== req.user.id),
      tripId,
      type: 'expense_added',
      message: `${payer?.name || 'Someone'} added an expense: ₹${amount} for ${description || category || 'trip costs'}.`,
      io: req.app.get('io')
    });

    res.status(201).json({ expense });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add expense', error: err.message });
  }
};

// GET /expense/split?tripId=...
const getSplitSummary = async (req, res) => {
  try {
    const { tripId } = req.query;

    if (!tripId) {
      return res.status(400).json({ message: 'tripId is required' });
    }

    const expenses = await Expense.find({ trip: tripId }).populate('paidBy', 'name email');

    if (expenses.length === 0) {
      return res.status(200).json({ totalSpent: 0, balances: {}, settlements: [] });
    }

    const balances = computeBalances(expenses);
    const settlements = computeMinimumSettlements(balances);
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

    res.status(200).json({ totalSpent, balances, settlements, expenses });
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute split summary', error: err.message });
  }
};

module.exports = { addExpense, getSplitSummary };
