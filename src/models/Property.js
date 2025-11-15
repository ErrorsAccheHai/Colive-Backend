const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['rent', 'electricity', 'water', 'maintenance', 'other'],
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'paid', 'overdue'],
        default: 'pending'
    },
    paidAt: Date,
    description: String
}, {
    timestamps: true
});

const issueSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'resolved'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    resolvedAt: Date,
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        text: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

const propertySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    price: {
        type: Number,
        required: false,
        default: 1
    },
    bedrooms: 
    { type: Number,
      default: 1,
      min: 1 },
    bathrooms: 
    { 
        type: Number,
        default: 1,
         min: 1 
    },

    amenities: [{
        type: String
    }],
    images: [{
        type: String // URLs to property images
    }],
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: {
        type: Date
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    tenants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        room: {
            type: String,
            required: true
        },
        rentAmount: {
            type: Number,
            required: true
        },
        startDate: {
            type: Date,
            required: true
        },
        endDate: Date,
        status: {
            type: String,
            enum: ['active', 'inactive', 'pending'],
            default: 'pending'
        }
    }],
    bills: [billSchema],
    issues: [issueSchema],
    rules: [{
        title: String,
        description: String
    }],
    facilities: [{
        name: String,
        description: String,
        isWorking: {
            type: Boolean,
            default: true
        }
    }],
    // How many tenants can be hosted simultaneously
    capacity: {
        type: Number,
        default: 1,
        min: 1
    },
    notifications: [{
        type: { type: String }, // 'rental' | 'purchase' | 'info'
        message: String,
        userId: mongoose.Schema.Types.ObjectId,
        userName: String,
        userEmail: String,
        userPhone: String,
        createdAt: { type: Date, default: Date.now },
        read: { type: Boolean, default: false }
    }]
    ,
    // Reviews and ratings
    reviews: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rating: { type: Number, min: 1, max: 5, required: true },
        comment: String,
        createdAt: { type: Date, default: Date.now }
    }],
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    // Keep property visible on public listings even if not currently available
    keepLive: { type: Boolean, default: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('Property', propertySchema);