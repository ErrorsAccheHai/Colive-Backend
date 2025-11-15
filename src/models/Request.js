const mongoose = require('mongoose');

const RequestSchema = new mongoose.Schema({
  // Basic info
  title: { type: String, required: true },
  description: { type: String },
  
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  
  // Booking type
  bookingType: {
    type: String,
    enum: ['rent', 'buy', 'own_contact', 'general'],
    default: 'general'
  },
  
  // Rent specific
  rentDetails: {
    period: { type: String, enum: ['daily', 'monthly', 'yearly'] },
    startDate: Date,
    endDate: Date,
    pricePerUnit: Number,
    totalPrice: Number,
    nights: Number,
    currency: { type: String, default: 'INR' }
  },
  
  // Buy specific
  buyDetails: {
    totalPrice: Number,
    paymentMethod: { type: String, enum: ['wallet', 'card', 'upi'] },
    ownership: { type: String, enum: ['lease', 'purchase'], default: 'purchase' }
  },
  
  // Own/Contact specific
  ownDetails: {
    message: String,
    contactAttempts: [{ timestamp: Date, message: String }],
    ownerResponse: String,
    ownerResponseDate: Date
  },
  
  // Payment tracking
  payment: {
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    transactionId: String,
    paymentMethod: String,
    paidAmount: Number,
    paidDate: Date,
    refundAmount: { type: Number, default: 0 },
    refundDate: Date
  },
  
  // Booking status
  bookingStatus: {
    type: String,
    enum: ['inquiry', 'awaiting_payment', 'payment_completed', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'],
    default: 'inquiry'
  },
  
  // Landlord approval
  landlordApproval: {
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvalDate: Date,
    message: String
  },
  
  // Cancellation
  cancellationPolicy: {
    type: String,
    enum: ['free', 'paid', 'no_cancellation'],
    default: 'paid'
  },
  
  cancellation: {
    cancelled: { type: Boolean, default: false },
    cancelledAt: Date,
    cancelledBy: String, // 'tenant' or 'landlord'
    reason: String,
    refundAmount: Number,
    refundStatus: String
  },
  
  // Dates
  checkinDate: Date,
  checkoutDate: Date,
  
  // Legacy status field
  status: { type: String, enum: ['Pending','In Progress','Resolved'], default: 'Pending' },
  
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Index for faster queries
RequestSchema.index({ tenant: 1, createdAt: -1 });
RequestSchema.index({ landlord: 1, createdAt: -1 });
RequestSchema.index({ property: 1 });
RequestSchema.index({ bookingStatus: 1 });

module.exports = mongoose.model('Request', RequestSchema);
