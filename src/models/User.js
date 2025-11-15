const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  phone: { type: String },
  role: { type: String, enum: ['tenant','landlord','admin'], default: 'tenant' },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  otp: { type: String },
  otpExpires: { type: Date },
  isEmailVerified: { type: Boolean, default: false },
  
  // Wallet system
  wallet: {
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // KYC verification
  kyc: {
    verified: { type: Boolean, default: false },
    verificationDate: Date,
    idType: String,
    idNumber: String
  },
  
  // Bank details for landlord withdrawals
  bankDetails: {
    accountName: String,
    accountNumber: String,
    ifsc: String,
    bankName: String,
    verified: { type: Boolean, default: false }
  },
  
  // Preferences
  preferences: {
    theme: { type: String, default: 'light' },
    notifications: { type: Boolean, default: true }
  },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
