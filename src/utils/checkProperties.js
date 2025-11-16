require('dotenv').config();
const mongoose = require('mongoose');
const Property = require('../models/Property');
const User = require('../models/User'); // Add User model for population
const connectDB = require('../config/db');

const checkProperties = async () => {
    try {
        await connectDB();
        
        // Get all properties with populated owner
        const properties = await Property.find({})
            .populate('owner', 'name email role')
            .lean();

        console.log('\n=== Property Status Report ===\n');
        console.log(`Total Properties: ${properties.length}\n`);

        // Group by status
        const byStatus = properties.reduce((acc, prop) => {
            acc[prop.status] = (acc[prop.status] || 0) + 1;
            return acc;
        }, {});

        console.log('Status Breakdown:');
        Object.entries(byStatus).forEach(([status, count]) => {
            console.log(`${status}: ${count}`);
        });

        // Detailed property list
        console.log('\nDetailed Property List:');
        properties.forEach((prop, index) => {
            console.log(`\n${index + 1}. ${prop.title}`);
            console.log(`   ID: ${prop._id}`);
            console.log(`   Status: ${prop.status}`);
            console.log(`   Owner: ${prop.owner?.name} (${prop.owner?.email})`);
            console.log(`   Price: ${prop.price}`);
            console.log(`   Verification: ${prop.isVerified ? 'Yes' : 'No'}`);
            if (prop.verifiedBy) {
                console.log(`   Verified At: ${prop.verifiedAt}`);
            }
        });

    } catch (error) {
        console.error('Error checking properties:', error);
    } finally {
        await mongoose.connection.close();
    }
};

checkProperties();