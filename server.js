const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Create express app
const app = express();

// Middleware
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const normalizeOrigin = (value) => {
    if (!value) return value;
    const trimmed = String(value).trim();
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

const corsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (normalizedAllowedOrigins.length === 0) return cb(null, true);
        if (normalizedAllowedOrigins.includes('*')) return cb(null, true);
        const normalizedOrigin = normalizeOrigin(origin);
        if (normalizedAllowedOrigins.includes(normalizedOrigin)) return cb(null, true);
        return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).end();
    }
    next();
});
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Routes
app.use('/api/registrations', require('./routes/registration.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
// app.use('/api/payments', require('./routes/payment.routes')); // Commented out as handled in registration routes for now

// Error handling middleware
app.use((err, req, res, next) => {
    const errMessage = (err && err.message) ? String(err.message).toLowerCase() : '';
    const errName = (err && err.name) ? String(err.name) : '';
    const errCode = err && (err.code !== undefined && err.code !== null) ? err.code : undefined;
    if (err && (
        err.type === 'entity.too.large' ||
        err.status === 413 ||
        err.statusCode === 413 ||
        err.status === '413' ||
        err.statusCode === '413' ||
        err.code === 'LIMIT_BODY_SIZE' ||
        err.code === 'ENTITY_TOO_LARGE' ||
        err.code === 'PayloadTooLargeError' ||
        err.code === 'LIMIT_FILE_SIZE' ||
        errName === 'MulterError' ||
        errMessage.includes('entity too large') ||
        errMessage.includes('request entity too large')
    )) {
        return res.status(413).json({
            success: false,
            message: 'Uploaded file is too large'
        });
    }

    if (errMessage.includes('only pdf') || errMessage.includes('jpg') || errMessage.includes('png')) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }

    // Mongo duplicate key error
    if (errCode === 11000 || errName === 'MongoServerError' && errCode === 11000) {
        let duplicateField = 'field';
        if (err && err.keyPattern && typeof err.keyPattern === 'object') {
            const keys = Object.keys(err.keyPattern);
            if (keys.length > 0) duplicateField = keys[0];
        } else if (err && err.keyValue && typeof err.keyValue === 'object') {
            const keys = Object.keys(err.keyValue);
            if (keys.length > 0) duplicateField = keys[0];
        }

        return res.status(409).json({
            success: false,
            message: `Duplicate value for ${duplicateField}`
        });
    }

    // Mongoose validation errors
    if (errName === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: err.message || 'Validation failed'
        });
    }

    // Mongoose invalid ObjectId cast, etc.
    if (errName === 'CastError') {
        return res.status(400).json({
            success: false,
            message: err.message || 'Invalid value'
        });
    }

    console.error(err);
    const message = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Internal Server Error');
    res.status(500).json({
        success: false,
        message
    });
});

const connectMongo = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('Missing MONGO_URI environment variable');
    }
    if (mongoose.connection.readyState === 1) return;
    if (mongoose.connection.readyState === 2) return;
    
    try {
        const connectOptions = {};
        try {
            const parsed = new URL(process.env.MONGO_URI);
            const dbFromPath = (parsed.pathname || '').replace('/', '').trim();
            if (!dbFromPath) {
                connectOptions.dbName = (process.env.MONGO_DB_NAME || 'chakravyuh').trim();
            }
        } catch {
            // Ignore URL parsing errors and fall back to default mongoose behavior
        }

        await mongoose.connect(process.env.MONGO_URI, connectOptions);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        
        // In development, provide a helpful error message
        if (process.env.NODE_ENV !== 'production') {
            console.log('\n💡 TROUBLESHOOTING TIPS:');
            console.log('1. Check your internet connection');
            console.log('2. Verify MONGO_URI in .env file');
            console.log('3. Make sure your IP is whitelisted in MongoDB Atlas');
            console.log('4. Try using a local MongoDB instance\n');
        }
        
        throw error;
    }
};

if (require.main === module) {
    // Try to connect to MongoDB, but start server anyway for testing
    connectMongo()
        .then(() => {
            // Start server
            const PORT = process.env.PORT || 5000;
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
                console.log('MongoDB connected and ready');
            });
        })
        .catch(err => {
            console.error('MongoDB connection failed:', err.message);
            console.log('\n⚠️  Starting server without MongoDB connection...');
            console.log('API endpoints will return database errors, but server is running for testing');
            
            // Start server anyway for testing
            const PORT = process.env.PORT || 5000;
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT} (MongoDB disconnected)`);
            });
        });
}

module.exports = app; // for testing
module.exports.connectMongo = connectMongo;
