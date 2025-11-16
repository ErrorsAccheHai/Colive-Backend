const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Property = require('../models/Property');
const Request = require('../models/Request');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Get dashboard stats
router.get('/stats', auth, roleCheck('admin'), async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            landlords,
            totalProperties,
            pendingProperties,
            totalRequests
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            User.countDocuments({ role: 'landlord' }),
            Property.countDocuments(),
            Property.countDocuments({ status: 'pending' }),
            Request.countDocuments()
        ]);

        res.json({
            totalUsers,
            activeUsers,
            landlords,
            totalProperties,
            pendingProperties,
            totalRequests
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all users
router.get('/users', auth, roleCheck('admin'), async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update user
router.put('/users/:id', auth, roleCheck('admin'), async (req, res) => {
    try {
        const { action, role, name } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Handle different actions
        switch (action) {
            case 'deactivate':
                // Prevent deactivating the last admin
                if (user.role === 'admin') {
                    const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
                    if (adminCount <= 1) {
                        return res.status(400).json({ message: 'Cannot deactivate the last admin' });
                    }
                }
                user.isActive = false;
                break;

            case 'activate':
                user.isActive = true;
                break;

            case 'update':
                if (role && role !== user.role) {
                    // Prevent removing the last admin
                    if (user.role === 'admin' && role !== 'admin') {
                        const adminCount = await User.countDocuments({ role: 'admin' });
                        if (adminCount <= 1) {
                            return res.status(400).json({ message: 'Cannot remove the last admin' });
                        }
                    }
                    user.role = role;
                }
                if (name) {
                    user.name = name;
                }
                break;

            default:
                return res.status(400).json({ message: 'Invalid action' });
        }

        await user.save();
        res.json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete user
router.delete('/users/:id', auth, roleCheck('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent deleting the last admin
        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot delete the last admin' });
            }
        }

        // Delete user's properties if they're a landlord
        if (user.role === 'landlord') {
            await Property.deleteMany({ owner: user._id });
        }

        // Delete user's requests
        await Request.deleteMany({ user: user._id });

        await user.delete();
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get all requests with user and property details
router.get('/requests', auth, roleCheck('admin'), async (req, res) => {
    try {
        const requests = await Request.find()
            .populate('user', 'name email')
            .populate('property', 'title')
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update request status
router.put('/requests/:id', auth, roleCheck('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const request = await Request.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        request.status = status;
        request.updatedBy = req.user._id;
        request.updatedAt = new Date();

        await request.save();
        res.json(request);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete request
router.delete('/requests/:id', auth, roleCheck('admin'), async (req, res) => {
    try {
        const request = await Request.findByIdAndDelete(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }
        res.json({ message: 'Request deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;