const express = require('express');
const router = express.Router();
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Step 1: Send OTP for email verification
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ msg: 'Email is required' });
    }

    console.log('Received OTP request for email:', email);

    // Check if email is already registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('Email already registered:', email);
      return res.status(400).json({ msg: 'Email already registered' });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Generated OTP:', otp, 'for email:', email);
    
    // Create or update temporary user with OTP
    await TempUser.findOneAndUpdate(
      { email },
      {
        email,
        otp,
        otpExpires: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
      },
      { upsert: true, new: true }
    );

    // Send OTP email
    const sendOtpMail = require('../utils/sendOtp');
    await sendOtpMail(email, otp);

    const isTestMode = process.env.TEST_MODE === 'true';
    const testRecipient = process.env.TEST_RECIPIENT;
    const note = isTestMode && testRecipient
      ? `In test mode, the OTP will also be BCC'd to ${testRecipient} for verification.`
      : undefined;

    res.json({ 
      msg: 'OTP sent successfully', 
      email,
      testMode: !!isTestMode,
      ...(note ? { note } : {})
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ msg: 'Failed to send OTP. Please try again.' });
  }
});

// Step 2: Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ msg: 'Email and OTP are required' });
    }

    // Find temporary user
    const tempUser = await TempUser.findOne({ 
      email, 
      otp,
      otpExpires: { $gt: new Date() }
    });

    if (!tempUser) {
      return res.status(400).json({ msg: 'Invalid or expired OTP' });
    }

    res.json({ 
      msg: 'OTP verified successfully',
      email 
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ msg: 'Failed to verify OTP' });
  }
});

// Step 3: Complete signup after OTP verification
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role, otp } = req.body;
    if (!name || !email || !password || !otp) {
      return res.status(400).json({ msg: 'Please enter all fields including OTP' });
    }

    // Verify OTP one last time
    const tempUser = await TempUser.findOne({ 
      email, 
      otp,
      otpExpires: { $gt: new Date() }
    });

    if (!tempUser) {
      return res.status(400).json({ msg: 'Invalid or expired OTP. Please request a new OTP.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create new user
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = new User({ 
      name, 
      email, 
      password: hashed, 
      role,
      isEmailVerified: true,
      wallet: {
        balance: 5000, // Test credit: ₹5000 for all new users
        currency: 'INR',
        createdAt: new Date(),
        lastUpdated: new Date()
      }
    });
    await user.save();

    // Log initial wallet transaction
    const WalletTransaction = require('../models/WalletTransaction');
    await WalletTransaction.create({
      userId: user._id,
      type: 'credit',
      amount: 5000,
      reason: 'deposit',
      description: 'Welcome bonus - Test credit for new users',
      balanceBefore: 0,
      balanceAfter: 5000,
      status: 'completed'
    });

    // Delete temporary user
    await TempUser.deleteOne({ email });

    // Generate token with name included
    const payload = { userId: user._id, role: user.role, name: user.name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { 
      expiresIn: process.env.JWT_EXPIRES_IN 
    });

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        wallet: { balance: 5000, currency: 'INR' }
      } 
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ msg: 'Failed to complete signup' });
  }
});

// Login with basic account lock logic
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body; // role optional
    console.log('Login attempt:', { email, role, passwordLength: password?.length });
    
    if (!email || !password) {
      console.log('Login failed: Missing email or password');
      return res.status(400).json({ msg: 'Enter email and password' });
    }

    const user = await User.findOne({ email });
    console.log('User lookup result:', user ? 'found' : 'not found');
    
    if (!user) {
      console.log('Login failed: User not found');
      return res.status(400).json({ msg: 'Incorrect credentials. Please try again.' });
  }

    // Check lock
    // NOTE: Account lock/check temporarily disabled by commenting out to avoid blocking during testing.
    // If you want to re-enable account lock, uncomment the block below.
    /*
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return res.status(423).json({ msg: 'Account temporarily locked.' });
    }
    */

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Temporarily disable account lock and failed-attempts increment during debugging/testing.
      // To restore lockout behavior, uncomment the following lines and adjust thresholds as needed.
      /*
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 3; // 3 login attempts per failure
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 5*60*1000); // 5 minutes
        await user.save();
        return res.status(423).json({ msg: 'Account temporarily locked.' });
      }
      await user.save();
      */
      return res.status(400).json({ msg: 'Incorrect credentials. Please try again.' });
    }

    // If client provided a role, verify it matches stored role and return a clear 403 with account preview if not matching
    if (role && role !== user.role) {
      return res.status(403).json({
        msg: 'Selected role does not match account role',
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    // reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    const payload = { userId: user._id, role: user.role, name: user.name };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// get current user (used by frontend)
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    res.json(user);
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
});

module.exports = router;
