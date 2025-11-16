const express = require('express');
const router = express.Router();
const Property = require('../models/Property');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
// quick check for config
const cloudinaryConfigured = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && !String(process.env.CLOUDINARY_API_KEY).toLowerCase().includes('your'));

// Get all properties (public)
// Show properties where keepLive is explicitly true OR (approved AND available AND not explicitly turned off)
router.get('/', async (req, res) => {
    try {
        const properties = await Property.find({ 
            $or: [ 
                { keepLive: true },
                { status: 'approved', isAvailable: true, keepLive: { $ne: false } }
            ]
        })
        .populate('owner', 'name email phone')
        .populate('tenants.user', 'name email phone')
        .sort('-createdAt')
        .select('-bills -issues'); // Don't send sensitive info to public

        console.log(`Found ${properties.length} public properties`);
        res.json(properties);
    } catch (error) {
        console.error('Error fetching public properties:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get landlord's properties
router.get('/my-properties', auth, roleCheck('landlord'), async (req, res) => {
    try {
        console.log('Fetching properties for landlord:', req.user.userId);
        
        const properties = await Property.find({ owner: req.user.userId })
            .populate('tenants.user', 'name email phone')
            .populate('verifiedBy', 'name')
            .sort('-createdAt');
        
        console.log(`Found ${properties.length} properties for landlord`);
        
        // Transform response to include verification status message
        const transformedProperties = properties.map(prop => {
            const property = prop.toObject();
            let statusMessage = '';
            
            switch(property.status) {
                case 'pending':
                    statusMessage = 'Under verification';
                    break;
                case 'rejected':
                    statusMessage = 'Verification rejected';
                    break;
                case 'approved':
                    statusMessage = 'Verified';
                    break;
            }
            
            return {
                ...property,
                statusMessage,
                verifiedDetails: property.verifiedBy ? {
                    date: property.verifiedAt,
                    by: property.verifiedBy.name
                } : null
            };
        });

        res.json(transformedProperties);
    } catch (error) {
        console.error('Error fetching landlord properties:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get property by ID (public)
router.get('/:id', async (req, res) => {
    try {
        const property = await Property.findById(req.params.id)
            .populate('owner', 'name email phone')
            .populate('tenants.user', 'name email phone');
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        res.json(property);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create property (landlord only)
router.post('/', auth, roleCheck('landlord'), upload.array('images', 5), async (req, res) => {
    try {
        const imageUrls = [];
        
        // Upload images to cloudinary if any
        let imagesSkipped = false;
        if (req.files && req.files.length > 0) {
            if (!cloudinaryConfigured) {
                // Save files locally to uploads/properties as a fallback
                try {
                    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'properties');
                    fs.mkdirSync(uploadsDir, { recursive: true });
                    for (const file of req.files) {
                        const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
                        const filepath = path.join(uploadsDir, filename);
                        fs.writeFileSync(filepath, file.buffer);
                        // push the public URL path
                        imageUrls.push(`/uploads/properties/${filename}`);
                    }
                } catch (err) {
                    console.error('Local image save error:', err);
                    return res.status(500).json({ message: `Failed to save images locally: ${err.message}` });
                }
            } else {
                for (const file of req.files) {
                    const b64 = Buffer.from(file.buffer).toString('base64');
                    const dataURI = 'data:' + file.mimetype + ';base64,' + b64;
                    try {
                        const result = await cloudinary.uploader.upload(dataURI, {
                            folder: 'co-live/properties',
                        });
                        imageUrls.push(result.secure_url);
                    } catch (err) {
                        console.error('Cloudinary upload error:', err);
                        return res.status(502).json({ message: `Cloudinary upload failed: ${err.message || JSON.stringify(err)}` });
                    }
                }
            }
        }

        // Helper to safely parse JSON or fall back to newline-splitting
        const parseMaybeJSON = (val) => {
            if (!val) return null;
            if (typeof val === 'object') return val;
            try {
                // try parsing JSON strings
                const parsed = JSON.parse(val);
                return parsed;
            } catch (e) {
                // not JSON, return original string
                return String(val);
            }
        };

        // rules: accept either JSON array/object or newline-separated string
        let rulesRaw = parseMaybeJSON(req.body.rules);
        let rules = [];
        if (Array.isArray(rulesRaw)) {
            // if array of strings or objects
            rules = rulesRaw.map(r => typeof r === 'string' ? { title: r, description: r } : r);
        } else if (typeof rulesRaw === 'string') {
            rules = rulesRaw.split('\n').filter(r => r.trim()).map(r => ({ title: r.trim(), description: r.trim() }));
        }

        // facilities: accept either JSON array/object or newline-separated string
        let facilitiesRaw = parseMaybeJSON(req.body.facilities);
        let facilities = [];
        if (Array.isArray(facilitiesRaw)) {
            facilities = facilitiesRaw.map(f => typeof f === 'string' ? { name: f, description: f, isWorking: true } : f);
        } else if (typeof facilitiesRaw === 'string') {
            facilities = facilitiesRaw.split('\n').filter(f => f.trim()).map(f => ({ name: f.trim(), description: f.trim(), isWorking: true }));
        }

        // address: may come as JSON-stringified object or as a comma-separated string
        let address = parseMaybeJSON(req.body.address) || {};
        if (typeof address === 'string') {
            const parts = address.split(',').map(p => p.trim());
            address = {
                street: parts[0] || '',
                city: parts[1] || '',
                state: parts[2] || '',
                country: parts[3] || '',
                zipCode: parts[4] || ''
            };
        }

        // Build property object matching the Mongoose model (title, price, bedrooms, bathrooms, owner)
        // Validate required fields
        const missing = [];
        if (!req.body.title && !req.body.name) missing.push('title');
        if (!req.body.price && !req.body.rent) missing.push('price');
        if (!req.body.bedrooms) missing.push('bedrooms');
        if (!req.body.bathrooms) missing.push('bathrooms');
        if (!req.user.userId) missing.push('owner (auth)');
        if (missing.length > 0) return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });

        const propertyData = {
            title: req.body.title || req.body.name,
            description: req.body.description || '',
            address,
            price: Number(req.body.price || req.body.rent),
            bedrooms: Number(req.body.bedrooms),
            bathrooms: Number(req.body.bathrooms),
            amenities: parseMaybeJSON(req.body.amenities) || [],
            images: imageUrls,
            owner: req.user.userId,
            isVerified: false,
            status: 'pending',
            keepLive: req.body.keepLive === 'true' || req.body.keepLive === true || false,
            capacity: Number(req.body.capacity) || 1,
            rules,
            facilities
        };

        const property = new Property(propertyData);

        const savedProperty = await property.save();
        if (imagesSkipped) {
            return res.status(201).json({ property: savedProperty, warning: 'Images were skipped because Cloudinary is not configured' });
        }
        res.status(201).json(savedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update property (landlord only - their own properties)
router.put('/:id', auth, roleCheck('landlord'), upload.array('images', 5), async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?._id;
        const property = await Property.findOne({ 
            _id: req.params.id,
            owner: userId
        });

        if (!property) {
            return res.status(404).json({ message: 'Property not found or unauthorized' });
        }

        let imageUrls = property.images || [];
        
        // Upload new images to cloudinary if any
        let imagesSkippedOnUpdate = false;
        if (req.files && req.files.length > 0) {
            if (!cloudinaryConfigured) {
                // Save update images locally
                try {
                    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'properties');
                    fs.mkdirSync(uploadsDir, { recursive: true });
                    for (const file of req.files) {
                        const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
                        const filepath = path.join(uploadsDir, filename);
                        fs.writeFileSync(filepath, file.buffer);
                        imageUrls.push(`/uploads/properties/${filename}`);
                    }
                } catch (err) {
                    console.error('Local image save error on update:', err);
                    return res.status(500).json({ message: `Failed to save images locally: ${err.message}` });
                }
            } else {
                for (const file of req.files) {
                    const b64 = Buffer.from(file.buffer).toString('base64');
                    const dataURI = 'data:' + file.mimetype + ';base64,' + b64;
                    try {
                        const result = await cloudinary.uploader.upload(dataURI, {
                            folder: 'co-live/properties',
                        });
                        imageUrls.push(result.secure_url);
                    } catch (err) {
                        console.error('Cloudinary upload error:', err);
                        return res.status(502).json({ message: `Cloudinary upload failed: ${err.message || JSON.stringify(err)}` });
                    }
                }
            }
        }

        // Convert rules and facilities strings to arrays if provided
        const rules = req.body.rules ? req.body.rules.split('\n').filter(rule => rule.trim()) : property.rules;
        const facilities = req.body.facilities ? req.body.facilities.split('\n').filter(facility => facility.trim()) : property.facilities;

        Object.assign(property, {
            name: req.body.name || property.name,
            description: req.body.description || property.description,
            address: req.body.address || property.address,
            rent: req.body.rent || property.rent,
            propertyType: req.body.propertyType || property.propertyType,
            rules,
            facilities,
            images: imageUrls
        });

        // allow updating keepLive flag from landlord
        if (typeof req.body.keepLive !== 'undefined') {
            // req.body.keepLive may be a string when using form-data
            if (typeof req.body.keepLive === 'string') {
                const v = req.body.keepLive.toLowerCase();
                property.keepLive = (v === 'true' || v === '1');
            } else {
                property.keepLive = Boolean(req.body.keepLive);
            }
        }

        const updatedProperty = await property.save();
        if (imagesSkippedOnUpdate) {
            return res.json({ property: updatedProperty, warning: 'Images were skipped because Cloudinary is not configured' });
        }
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Delete property (landlord only - their own properties)
router.delete('/:id', auth, roleCheck('landlord'), async (req, res) => {
    try {
        const property = await Property.findOneAndDelete({
            _id: req.params.id,
            owner: req.user.userId
        });

        if (!property) {
            return res.status(404).json({ message: 'Property not found or unauthorized' });
        }

        res.json({ message: 'Property deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Toggle keepLive explicitly (landlord only)
router.patch('/:id/keep-live', auth, roleCheck('landlord'), async (req, res) => {
    try {
        console.log('PATCH /keep-live called for property:', req.params.id);
        console.log('User:', req.user?.userId || req.user?._id);
        console.log('Body:', req.body);
        
        const userId = req.user?.userId || req.user?._id;
        const property = await Property.findOne({ _id: req.params.id, owner: userId });
        if (!property) {
            console.log('Property not found or unauthorized');
            return res.status(404).json({ message: 'Property not found or unauthorized' });
        }

        if (typeof req.body.keepLive === 'undefined') {
            console.log('keepLive value missing');
            return res.status(400).json({ message: 'keepLive value required' });
        }
        
        console.log('Setting keepLive to:', req.body.keepLive);
        // parse string booleans as before
        if (typeof req.body.keepLive === 'string') {
            const v = req.body.keepLive.toLowerCase();
            property.keepLive = (v === 'true' || v === '1');
        } else {
            property.keepLive = Boolean(req.body.keepLive);
        }

        console.log('Saving property with keepLive:', property.keepLive);
        const updated = await property.save();
        console.log('Saved successfully. Updated keepLive:', updated.keepLive);
        res.json({ keepLive: updated.keepLive });
    } catch (err) {
        console.error('Error in PATCH /keep-live:', err);
        res.status(400).json({ message: err.message });
    }
});

// Admin routes for property verification
// Get pending properties (admin only)
router.get('/admin/pending', auth, roleCheck('admin'), async (req, res) => {
    try {
        console.log('Admin fetching pending properties');
        
        const properties = await Property.find({ status: 'pending' })
            .populate('owner', 'name email phone')
            .sort('-createdAt')
            .lean();
        
        console.log(`Found ${properties.length} pending properties`);
        
        if (properties.length === 0) {
            return res.json([]);
        }

        // Add submission date and time since submission
        const propertiesWithTiming = properties.map(property => {
            const submittedAt = property.createdAt;
            const hoursAgo = Math.round((Date.now() - new Date(submittedAt)) / (1000 * 60 * 60));
            
            return {
                ...property,
                submittedAt,
                timeAgo: `${hoursAgo} hours ago`
            };
        });

        res.json(propertiesWithTiming);
    } catch (error) {
        console.error('Error fetching pending properties:', error);
        res.status(500).json({ message: error.message });
    }
});

// Verify property (admin only)
router.put('/admin/verify/:id', auth, roleCheck('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        property.status = status;
        if (status === 'approved') {
            property.isVerified = true;
            property.verifiedBy = req.user?.userId || req.user?._id;
            property.verifiedAt = new Date();
        }

        const updatedProperty = await property.save();
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add tenant to property
router.post('/:id/tenants', auth, roleCheck('landlord'), async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?._id;
        const property = await Property.findOne({
            _id: req.params.id,
            owner: userId
        });

        if (!property) {
            return res.status(404).json({ message: 'Property not found or unauthorized' });
        }

        // Check if tenant is already added
        if (property.tenants.includes(req.body.tenantId)) {
            return res.status(400).json({ message: 'Tenant already added' });
        }

        property.tenants.push(req.body.tenantId);
        property.isAvailable = false;

        // Auto-disable keepLive when capacity reached
        try {
            const cap = property.capacity || 1;
            const tenantCount = Array.isArray(property.tenants) ? property.tenants.length : 0;
            if (tenantCount >= cap) {
                property.keepLive = false;
            }
        } catch (e) {
            // ignore
        }

        const updatedProperty = await property.save();
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Tenant rents a property
router.post('/:id/rent', auth, roleCheck('tenant'), async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ message: 'Property not found' });
        if (!property.isAvailable) return res.status(400).json({ message: 'Property not available' });

        // Get tenant details
        const User = require('../models/User');
        const tenant = await User.findById(req.user.userId);
        const tenantId = req.user.userId;
        
        property.tenants.push({
            user: tenantId,
            room: req.body.room || 'main',
            rentAmount: req.body.rentAmount || property.price,
            startDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
            status: 'active'
        });
        property.isAvailable = false;
        // Auto-disable keepLive when capacity reached
        try {
            const cap = property.capacity || 1;
            const tenantCount = Array.isArray(property.tenants) ? property.tenants.length : 0;
            if (tenantCount >= cap) {
                property.keepLive = false;
            }
        } catch (e) {}
        // Add notification with user details
        property.notifications = property.notifications || [];
        property.notifications.push({ 
            type: 'rental', 
            message: `Property rented by ${tenant?.name || 'Tenant'} (${tenant?.email || tenantId})`,
            userId: tenantId,
            userName: tenant?.name,
            userEmail: tenant?.email,
            userPhone: tenant?.phone
        });

        const updated = await property.save();
        // Log for admin monitoring
        console.log(`Property ${property._id} rented by ${tenant?.name || tenantId}`);
        res.status(200).json(updated);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Tenant purchases a property (transfer ownership)
router.post('/:id/buy', auth, roleCheck('tenant'), async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ message: 'Property not found' });
        if (!property.isAvailable) return res.status(400).json({ message: 'Property not available' });

        // Get buyer details
        const User = require('../models/User');
        const buyer = await User.findById(req.user.userId);
        const buyerId = req.user.userId;
        
        // mark as sold (not available) and set owner
        property.isAvailable = false;
        property.owner = buyerId;
        property.status = 'approved';
        property.isVerified = true;
        property.notifications = property.notifications || [];
        property.notifications.push({ 
            type: 'purchase', 
            message: `Property purchased by ${buyer?.name || 'Buyer'} (${buyer?.email || buyerId})`,
            userId: buyerId,
            userName: buyer?.name,
            userEmail: buyer?.email,
            userPhone: buyer?.phone
        });

        const updated = await property.save();
        console.log(`Property ${property._id} purchased by ${buyer?.name || buyerId}`);
        res.status(200).json(updated);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Remove tenant from property
router.delete('/:id/tenants/:tenantId', auth, roleCheck('landlord'), async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?._id;
        const property = await Property.findOne({
            _id: req.params.id,
            owner: userId
        });

        if (!property) {
            return res.status(404).json({ message: 'Property not found or unauthorized' });
        }

        // Remove tenant
        // tenants is an array of objects { user, room, ... }
        property.tenants = property.tenants.filter(
            tenant => String(tenant.user) !== String(req.params.tenantId)
        );
        
        // Update availability if no tenants
        if (property.tenants.length === 0) {
            property.isAvailable = true;
        }
        // If capacity is no longer full, we do NOT auto-enable keepLive; owner can toggle it back on

        const updatedProperty = await property.save();
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add bill to property
router.post('/:id/bills', auth, roleCheck('landlord'), async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?._id;
        const property = await Property.findOne({
            _id: req.params.id,
            owner: userId
        });

        if (!property) {
            return res.status(404).json({ message: 'Property not found or unauthorized' });
        }

        property.bills.push({
            title: req.body.title,
            amount: req.body.amount,
            dueDate: req.body.dueDate,
            description: req.body.description,
            type: req.body.type,
            status: 'pending'
        });

        const updatedProperty = await property.save();
        res.status(201).json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update bill status
router.patch('/:id/bills/:billId', auth, async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        const bill = property.bills.id(req.params.billId);
        if (!bill) {
            return res.status(404).json({ message: 'Bill not found' });
        }

        // Check authorization
        const userId2 = req.user?.userId || req.user?._id;
        const isOwner = req.user.role === 'landlord' && String(property.owner) === String(userId2);
        const isTenant = req.user.role === 'tenant' && Array.isArray(property.tenants) && property.tenants.some(t => String(t.user) === String(userId2));
        if (!(isOwner || isTenant)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        bill.status = req.body.status;
        if (req.body.status === 'paid') {
            bill.paidAt = new Date();
            bill.paidBy = req.user._id;
        }

        const updatedProperty = await property.save();
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Add issue to property
router.post('/:id/issues', auth, async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Check if user is landlord or tenant
        const userId3 = req.user?.userId || req.user?._id;
        const isTenant2 = req.user.role === 'tenant' && Array.isArray(property.tenants) && property.tenants.some(t => String(t.user) === String(userId3));
        const isOwner2 = req.user.role === 'landlord' && String(property.owner) === String(userId3);
        if (!(isTenant2 || isOwner2)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        property.issues.push({
            title: req.body.title,
            description: req.body.description,
            priority: req.body.priority,
            reportedBy: req.user._id,
            status: 'pending'
        });

        const updatedProperty = await property.save();
        res.status(201).json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update issue status
router.patch('/:id/issues/:issueId', auth, async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        const issue = property.issues.id(req.params.issueId);
        if (!issue) {
            return res.status(404).json({ message: 'Issue not found' });
        }

        // Check if user is landlord or tenant
        const userId4 = req.user?.userId || req.user?._id;
        const isTenant3 = req.user.role === 'tenant' && Array.isArray(property.tenants) && property.tenants.some(t => String(t.user) === String(userId4));
        const isOwner3 = req.user.role === 'landlord' && String(property.owner) === String(userId4);
        if (!(isTenant3 || isOwner3)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Only landlord can mark issue as resolved
        if (req.body.status === 'resolved' && req.user.role !== 'landlord') {
            return res.status(403).json({ message: 'Only landlord can mark issues as resolved' });
        }

        issue.status = req.body.status;
        if (req.body.status === 'resolved') {
            issue.resolvedAt = new Date();
            issue.resolvedBy = req.user._id;
        }

        const updatedProperty = await property.save();
        res.json(updatedProperty);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;

// Submit a review for a property
router.post('/:id/reviews', auth, async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) return res.status(404).json({ message: 'Property not found' });

        const rating = Number(req.body.rating);
        const comment = req.body.comment || '';
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Invalid rating' });

        property.reviews = property.reviews || [];
        property.reviews.push({ user: req.user.userId, rating, comment });
        // update aggregates
        property.totalReviews = property.reviews.length;
        const sum = property.reviews.reduce((s, r) => s + (r.rating || 0), 0);
        property.averageRating = sum / property.totalReviews;

        const updated = await property.save();
        res.status(201).json({ averageRating: updated.averageRating, totalReviews: updated.totalReviews });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Get reviews for a property (public)
router.get('/:id/reviews', async (req, res) => {
    try {
        const property = await Property.findById(req.params.id).populate('reviews.user', 'name email');
        if (!property) return res.status(404).json({ message: 'Property not found' });
        res.json({ reviews: property.reviews || [], averageRating: property.averageRating || 0, totalReviews: property.totalReviews || 0 });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});