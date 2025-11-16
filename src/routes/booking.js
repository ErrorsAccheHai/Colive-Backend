const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Request = require('../models/Request');
const User = require('../models/User');
const Property = require('../models/Property');
const WalletTransaction = require('../models/WalletTransaction');

// ============= Tenant Routes =============

// Create a booking (rent/buy/own)
router.post('/create', auth, roleCheck(['tenant']), async (req, res) => {
  try {
    const {
      propertyId,
      bookingType, // 'rent' | 'buy' | 'own_contact'
      rentDetails, // { period, startDate, endDate, nights, pricePerUnit }
      buyDetails, // { totalPrice, ownership }
      ownDetails, // { message }
      paymentMethod // 'wallet' | 'card'
    } = req.body;

    // Validate property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get property landlord
    const landlord = property.owner;

    let totalPrice = 0;
    let bookingData = {
      title: `${bookingType.toUpperCase()} Request - ${property.title}`,
      description: `Booking request for property: ${property.title}`,
      tenant: req.user.userId,
      landlord,
      property: propertyId,
      bookingType
    };

    // Handle different booking types
    if (bookingType === 'rent') {
      if (!rentDetails) {
        return res.status(400).json({ error: 'Rent details required' });
      }

      bookingData.rentDetails = rentDetails;
      totalPrice = rentDetails.totalPrice || 0;
      bookingData.checkinDate = rentDetails.startDate;
      bookingData.checkoutDate = rentDetails.endDate;

    } else if (bookingType === 'buy') {
      if (!buyDetails) {
        return res.status(400).json({ error: 'Buy details required' });
      }

      bookingData.buyDetails = buyDetails;
      totalPrice = buyDetails.totalPrice || 0;

    } else if (bookingType === 'own_contact') {
      if (!ownDetails) {
        return res.status(400).json({ error: 'Contact details required' });
      }

      bookingData.ownDetails = ownDetails;
      bookingData.bookingStatus = 'inquiry'; // No payment for inquiry
    }

    // Set payment details
    if (bookingType !== 'own_contact') {
      bookingData.payment = {
        status: 'pending',
        paymentMethod: paymentMethod || 'wallet',
        paidAmount: 0
      };
      bookingData.bookingStatus = 'awaiting_payment';
    }

    // Create the booking request
    const booking = await Request.create(bookingData);

    res.json({
      success: true,
      message: 'Booking request created',
      booking,
      totalPrice: totalPrice
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tenant's bookings
router.get('/my-bookings', auth, roleCheck(['tenant']), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let query = { tenant: req.user.userId, bookingType: { $ne: 'general' } };

    if (status) query.bookingStatus = status;
    if (type) query.bookingType = type;

    const bookings = await Request.find(query)
      .populate('property', 'title images address')
      .populate('landlord', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Request.countDocuments(query);

    res.json({
      success: true,
      bookings,
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

// Get specific booking details
router.get('/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Request.findById(req.params.bookingId)
      .populate('property')
      .populate('tenant', 'name email phone')
      .populate('landlord', 'name email phone');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check authorization
    if (booking.tenant._id.toString() !== req.user.userId && 
        booking.landlord._id.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process payment for booking
router.post('/:bookingId/pay', auth, roleCheck(['tenant']), async (req, res) => {
  try {
    const { paymentMethod } = req.body; // 'wallet' or 'card'
    
    const booking = await Request.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.tenant.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (booking.bookingStatus !== 'awaiting_payment') {
      return res.status(400).json({ error: 'Booking is not awaiting payment' });
    }

    const totalPrice = booking.rentDetails?.totalPrice || booking.buyDetails?.totalPrice || 0;

    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({ error: 'Invalid booking amount' });
    }

    // Handle wallet payment
    if (paymentMethod === 'wallet') {
      const user = await User.findById(req.user.userId);

      if (user.wallet.balance < totalPrice) {
        return res.status(400).json({
          error: 'Insufficient wallet balance',
          required: totalPrice,
          available: user.wallet.balance
        });
      }

      // Deduct from wallet
      await User.findByIdAndUpdate(
        req.user.userId,
        {
          $inc: { 'wallet.balance': -totalPrice },
          $set: { 'wallet.lastUpdated': new Date() }
        }
      );

      // Log transaction
      await WalletTransaction.create({
        userId: req.user.userId,
        type: 'debit',
        amount: totalPrice,
        reason: 'payment',
        bookingId: booking._id,
        description: `Payment for ${booking.bookingType} booking`,
        paymentGateway: 'wallet',
        status: 'completed'
      });

      // Update booking
      const updatedBooking = await Request.findByIdAndUpdate(
        req.params.bookingId,
        {
          bookingStatus: 'payment_completed',
          'payment.status': 'completed',
          'payment.paymentMethod': 'wallet',
          'payment.paidAmount': totalPrice,
          'payment.paidDate': new Date(),
          'payment.transactionId': `WALLET_${Date.now()}`,
          'landlordApproval.status': 'pending'
        },
        { new: true }
      );

      return res.json({
        success: true,
        message: 'Payment successful from wallet',
        booking: updatedBooking
      });
    }

    // For card payment, return order details to initiate Razorpay on frontend
    res.json({
      success: true,
      message: 'Ready for card payment',
      amount: totalPrice,
      bookingId: booking._id,
      paymentMethod: 'card'
    });

  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel booking
router.post('/:bookingId/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await Request.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.tenant.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (['completed', 'cancelled', 'rejected'].includes(booking.bookingStatus)) {
      return res.status(400).json({ error: 'Cannot cancel this booking' });
    }

    let refundAmount = 0;

    // Calculate refund based on cancellation policy
    if (booking.payment.status === 'completed' && booking.cancellationPolicy !== 'no_cancellation') {
      if (booking.cancellationPolicy === 'free') {
        refundAmount = booking.payment.paidAmount;
      } else if (booking.cancellationPolicy === 'paid') {
        // 50% refund for paid cancellation
        refundAmount = Math.round(booking.payment.paidAmount * 0.5);
      }

      // Add refund back to wallet
      if (refundAmount > 0) {
        await User.findByIdAndUpdate(
          req.user.userId,
          {
            $inc: { 'wallet.balance': refundAmount },
            $set: { 'wallet.lastUpdated': new Date() }
          }
        );

        await WalletTransaction.create({
          userId: req.user.userId,
          type: 'credit',
          amount: refundAmount,
          reason: 'refund',
          bookingId: booking._id,
          description: `Refund for cancelled booking`
        });
      }
    }

    const updatedBooking = await Request.findByIdAndUpdate(
      req.params.bookingId,
      {
        bookingStatus: 'cancelled',
        'cancellation.cancelled': true,
        'cancellation.cancelledAt': new Date(),
        'cancellation.cancelledBy': 'tenant',
        'cancellation.reason': reason,
        'cancellation.refundAmount': refundAmount,
        'cancellation.refundStatus': refundAmount > 0 ? 'processed' : 'no_refund'
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Booking cancelled',
      refundAmount,
      booking: updatedBooking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Landlord Routes =============

// Get pending approvals
router.get('/landlord/pending', auth, roleCheck(['landlord']), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const bookings = await Request.find({
      landlord: req.user.userId,
      'landlordApproval.status': 'pending',
      bookingType: { $ne: 'general' }
    })
      .populate('tenant', 'name email phone')
      .populate('property', 'title images')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Request.countDocuments({
      landlord: req.user.userId,
      'landlordApproval.status': 'pending',
      bookingType: { $ne: 'general' }
    });

    res.json({
      success: true,
      bookings,
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

// Approve booking
router.post('/:bookingId/approve', auth, roleCheck(['landlord']), async (req, res) => {
  try {
    const { message } = req.body;

    const booking = await Request.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.landlord.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedBooking = await Request.findByIdAndUpdate(
      req.params.bookingId,
      {
        'landlordApproval.status': 'approved',
        'landlordApproval.approvalDate': new Date(),
        'landlordApproval.message': message,
        bookingStatus: 'confirmed'
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Booking approved',
      booking: updatedBooking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject booking
router.post('/:bookingId/reject', auth, roleCheck(['landlord']), async (req, res) => {
  try {
    const { message } = req.body;

    const booking = await Request.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.landlord.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Refund if payment completed
    if (booking.payment.status === 'completed') {
      const refundAmount = booking.payment.paidAmount;

      await User.findByIdAndUpdate(
        booking.tenant,
        {
          $inc: { 'wallet.balance': refundAmount },
          $set: { 'wallet.lastUpdated': new Date() }
        }
      );

      await WalletTransaction.create({
        userId: booking.tenant,
        type: 'credit',
        amount: refundAmount,
        reason: 'refund',
        bookingId: booking._id,
        description: `Refund for rejected booking`
      });
    }

    const updatedBooking = await Request.findByIdAndUpdate(
      req.params.bookingId,
      {
        'landlordApproval.status': 'rejected',
        'landlordApproval.approvalDate': new Date(),
        'landlordApproval.message': message,
        bookingStatus: 'rejected',
        'payment.status': 'refunded'
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Booking rejected',
      booking: updatedBooking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get landlord's earnings
router.get('/landlord/earnings', auth, roleCheck(['landlord']), async (req, res) => {
  try {
    const bookings = await Request.find({
      landlord: req.user.userId,
      bookingStatus: 'confirmed',
      'payment.status': 'completed'
    });

    const totalEarnings = bookings.reduce((sum, booking) => {
      return sum + (booking.payment.paidAmount || 0);
    }, 0);

    const pendingEarnings = bookings.filter(b => !b.checkoutDate || b.checkoutDate > new Date())
      .reduce((sum, booking) => {
        return sum + (booking.payment.paidAmount || 0);
      }, 0);

    const activeBookings = bookings.filter(b => 
      !b.checkoutDate || b.checkoutDate > new Date()
    ).length;

    res.json({
      success: true,
      earnings: {
        totalEarnings,
        pendingEarnings,
        completedEarnings: totalEarnings - pendingEarnings,
        activeBookings,
        totalBookings: bookings.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get landlord's active bookings
router.get('/landlord/active', auth, roleCheck(['landlord']), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const bookings = await Request.find({
      landlord: req.user.userId,
      bookingStatus: 'confirmed'
    })
      .populate('tenant', 'name email phone')
      .populate('property', 'title')
      .sort({ checkinDate: 1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Request.countDocuments({
      landlord: req.user.userId,
      bookingStatus: 'confirmed'
    });

    res.json({
      success: true,
      bookings,
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

module.exports = router;
