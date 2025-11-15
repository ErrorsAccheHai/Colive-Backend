const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Property = require('../models/Property');
const auth = require('../middleware/auth');
const router = express.Router();

// Get profile
router.get('/me', auth, async (req,res)=>{
  const user = await User.findById(req.user.userId).select('-password');
  res.json(user);
});

// Get user's property statistics (rented, bought)
router.get('/me/properties-stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Count rented properties (tenant in properties array)
    const rentedCount = await Property.countDocuments({
      'tenants.user': userId
    });
    
    // Count bought properties (user is owner after purchase)
    const boughtCount = await Property.countDocuments({
      owner: userId,
      status: 'approved',
      isVerified: true
    });
    
    res.json({
      rented: rentedCount,
      bought: boughtCount,
      total: rentedCount + boughtCount
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get detailed rented properties
router.get('/me/properties-rented', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('Fetching rented properties for user:', userId);
    
    const properties = await Property.find({ 'tenants.user': userId })
      .populate('owner', 'name email phone')
      .select('title description price bedrooms bathrooms images address tenants amenities rentPrice');
    
    console.log('Found rented properties:', properties.length);
    
    // Return properties with tenant info for this user
    const result = properties.map(prop => {
      const userTenantInfo = prop.tenants.find(t => String(t.user) === String(userId));
      console.log('Property:', prop.title, 'User tenant info:', userTenantInfo);
      return {
        _id: prop._id,
        title: prop.title || prop.propertyName,
        description: prop.description,
        price: prop.price,
        rentPrice: prop.rentPrice || prop.price,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        images: prop.images || [],
        address: prop.address,
        amenities: prop.amenities,
        owner: prop.owner,
        tenants: prop.tenants,
        userTenantInfo: userTenantInfo
      };
    });
    
    console.log('Returning result:', result);
    res.json(result);
  } catch (err) {
    console.error('Error fetching rented properties:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get detailed bought properties
router.get('/me/properties-bought', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const properties = await Property.find({
      owner: userId,
      status: 'approved',
      isVerified: true
    }).select('title description price bedrooms bathrooms images address amenities');
    
    res.json(properties);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update profile
router.put('/me', auth, async (req,res)=>{
  const { name, password } = req.body;
  const updates = {};
  if(name) updates.name = name;
  if(password){
    const salt = await bcrypt.genSalt(10);
    updates.password = await bcrypt.hash(password, salt);
  }
  const user = await User.findByIdAndUpdate(req.user.userId, updates, { new:true }).select('-password');
  res.json(user);
});

module.exports = router;
