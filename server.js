require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');
const cors = require('cors');

const app = express();
connectDB();

app.use(express.json());
app.use(cors());
const path = require('path');

// Serve uploaded files (local fallback for images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/user', require('./src/routes/user'));
app.use('/api/request', require('./src/routes/request'));
app.use('/api/property', require('./src/routes/property'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/wallet', require('./src/routes/wallet'));
app.use('/api/booking', require('./src/routes/booking'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
