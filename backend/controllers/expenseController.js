const Expense = require('../models/Expense');
const TripMember = require('../models/TripMember');
const { computeBalances, computeMinimumSettlements } = require('../utils/settlement');

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
