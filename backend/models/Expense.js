const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      enum: ['fuel', 'food', 'tolls', 'hotels', 'parking', 'other'],
      default: 'other'
    },
    description: { type: String, trim: true },
    amount: { type: Number, required: true },
    splitAmong: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
