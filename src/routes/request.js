const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Tenant creates request
router.post('/', auth, roleCheck(['tenant']), async (req,res)=>{
  const { title, description } = req.body;
  const newReq = new Request({
    title, description, tenant: req.user.userId
  });
  await newReq.save();
  res.json(newReq);
});

// Tenant views own requests
router.get('/my', auth, roleCheck(['tenant']), async (req,res)=>{
  const requests = await Request.find({ tenant:req.user.userId });
  res.json(requests);
});

// Landlord views all
router.get('/', auth, roleCheck(['landlord']), async (req,res)=>{
  const requests = await Request.find().populate('tenant','name email');
  res.json(requests);
});

// Landlord updates status
router.put('/:id', auth, roleCheck(['landlord']), async (req,res)=>{
  const { status } = req.body;
  const updated = await Request.findByIdAndUpdate(req.params.id, { status }, { new:true });
  res.json(updated);
});

module.exports = router;
