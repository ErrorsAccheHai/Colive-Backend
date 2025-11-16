const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property'
  },
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  currency: {
    type: String,
    default: 'INR'
  },
  
  paymentMethod: {
    type: String,
    enum: ['wallet', 'razorpay', 'stripe', 'upi'],
    required: true
  },
  
  // Razorpay specific fields
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  
  // Stripe specific fields
  stripePaymentIntentId: String,
  stripeChargeId: String,
  
  status: {
    type: String,
    enum: ['initiated', 'processing', 'completed', 'failed', 'refunded', 'disputed'],
    default: 'initiated'
  },
  
  paymentType: {
    type: String,
    enum: ['booking', 'wallet_topup', 'security_deposit'],
    default: 'booking'
  },
  
  failureReason: String,
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  completedAt: Date,
  
  refundedAt: Date,
  refundAmount: {
    type: Number,
    default: 0
  },
  
  metadata: {
    bookingType: String,
    period: String,
    startDate: Date,
    endDate: Date,
    nights: Number,
    taxAmount: Number,
    platformFee: Number
  }
});

// Index for faster queries
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', PaymentSchema);
