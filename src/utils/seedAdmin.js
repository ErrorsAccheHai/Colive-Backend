require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/db');

// Usage:
// node seedAdmin.js         -> creates admin only if not present
// node seedAdmin.js --force -> will delete existing admin with same email and recreate
const seedAdmin = async () => {
    try {
        await connectDB();

        // Check if admin already exists
        const adminEmail = process.env.SEED_ADMIN_EMAIL || 'ashishbhartijnv@gmail.com';
        const force = process.argv.includes('--force');

        const existingAdmin = await User.findOne({ email: adminEmail });
        if (existingAdmin && !force) {
            console.log('Admin user already exists:', adminEmail);
            process.exit(0);
        }
        if (existingAdmin && force) {
            console.log('Force flag provided - deleting existing admin:', adminEmail);
            await User.deleteOne({ email: adminEmail });
        }

        const hashedPassword = await bcrypt.hash('Admin123', 10);

        const admin = new User({
            name: process.env.SEED_ADMIN_NAME || 'Admin',
            email: process.env.SEED_ADMIN_EMAIL || 'ashishbhartijnv@gmail.com',
            password: hashedPassword,
            role: 'admin',
            isVerified: true,
            phoneNumber: process.env.SEED_ADMIN_PHONE || '0000000000', // Default phone number
            verified: true
        });

        await admin.save();
        console.log('Admin user created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();