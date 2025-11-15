const mongoose = require('mongoose');

const TempUserSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  otp: { 
    type: String, 
    required: true 
  },
  name: String,
  password: String,
  role: { 
    type: String, 
    enum: ['tenant', 'landlord', 'admin'],
    default: 'tenant'
  },
  otpExpires: { 
    type: Date, 
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 600 // Document will be automatically deleted after 10 minutes
  }
});

module.exports = mongoose.model('TempUser', TempUserSchema);