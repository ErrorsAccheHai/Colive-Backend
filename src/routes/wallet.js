const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');

// ============= Wallet Balance Routes =============

// Get wallet balance
router.get('/balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      balance: user.wallet?.balance || 0,
      currency: user.wallet?.currency || 'INR',
      lastUpdated: user.wallet?.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get wallet transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ userId: req.user.userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await WalletTransaction.countDocuments({ userId: req.user.userId });

    res.json({
      success: true,
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Simple Wallet Top-up (for testing) =============

// Add test credit to wallet (simple - for demo/testing purposes)
router.post('/add-credit', auth, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Limit for testing
    if (amount > 50000) {
      return res.status(400).json({ error: 'Maximum ₹50,000 per transaction for testing' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $inc: { 'wallet.balance': amount },
        $set: { 'wallet.lastUpdated': new Date() }
      },
      { new: true }
    );

    // Log transaction
    const transaction = await WalletTransaction.create({
      userId: req.user.userId,
      type: 'credit',
      amount: amount,
      reason: 'deposit',
      paymentGateway: 'wallet',
      description: 'Test credit added',
      balanceBefore: user.wallet.balance - amount,
      balanceAfter: user.wallet.balance,
      status: 'completed'
    });

    res.json({
      success: true,
      message: `₹${amount} added to wallet successfully`,
      balance: user.wallet.balance,
      transaction: transaction._id
    });
  } catch (error) {
    console.error('Wallet top-up error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= Wallet Operations (Used by Booking System) =============

// Deduct money from wallet (used by booking system)
router.post('/deduct', auth, async (req, res) => {
  try {
    const { amount, reason, bookingId, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.wallet.balance < amount) {
      return res.status(400).json({ 
        error: 'Insufficient wallet balance',
        required: amount,
        available: user.wallet.balance,
        shortfall: amount - user.wallet.balance
      });
    }

    // Deduct from wallet
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $inc: { 'wallet.balance': -amount },
        $set: { 'wallet.lastUpdated': new Date() }
      },
      { new: true }
    );

    // Log transaction
    const transaction = await WalletTransaction.create({
      userId: req.user.userId,
      type: 'debit',
      amount,
      reason: reason || 'payment',
      bookingId,
      description,
      balanceBefore: user.wallet.balance,
      balanceAfter: updatedUser.wallet.balance,
      status: 'completed'
    });

    res.json({
      success: true,
      message: 'Amount deducted from wallet',
      balance: updatedUser.wallet.balance,
      transaction: transaction._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refund to wallet
router.post('/refund', auth, async (req, res) => {
  try {
    const { amount, bookingId, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $inc: { 'wallet.balance': amount },
        $set: { 'wallet.lastUpdated': new Date() }
      },
      { new: true }
    );

    const transaction = await WalletTransaction.create({
      userId: req.user.userId,
      type: 'credit',
      amount,
      reason: 'refund',
      bookingId,
      description: reason || 'Booking refund',
      balanceBefore: user.wallet.balance - amount,
      balanceAfter: user.wallet.balance,
      status: 'completed'
    });

    res.json({
      success: true,
      message: 'Refund processed',
      balance: user.wallet.balance,
      transaction: transaction._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
