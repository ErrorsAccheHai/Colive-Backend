const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  reason: {
    type: String,
    enum: ['payment', 'refund', 'cancellation', 'deposit', 'earnings', 'withdrawal', 'adjustment'],
    required: true
  },
  
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  
  description: String,
  
  balanceBefore: Number,
  balanceAfter: Number,
  
  // For external payments
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'wallet', 'upi'],
    default: 'wallet'
  },
  
  transactionId: String,
  
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  },
  
  metadata: mongoose.Schema.Types.Mixed,
  
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for faster queries
WalletTransactionSchema.index({ userId: 1, timestamp: -1 });
WalletTransactionSchema.index({ transactionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);
