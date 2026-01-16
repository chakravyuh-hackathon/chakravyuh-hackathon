const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/User');
const Registration = require('../models/Registration');

const signToken = (userId) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('Missing JWT_SECRET environment variable');
    }
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d'
    });
};

exports.getSetupStatus = async (req, res, next) => {
    try {
        const adminCount = await User.countDocuments({ role: 'admin' });
        res.json({
            success: true,
            adminExists: adminCount > 0,
            setupKeyRequired: Boolean(process.env.ADMIN_SETUP_KEY)
        });
    } catch (error) {
        next(error);
    }
};

exports.setupAdmin = async (req, res, next) => {
    try {
        const { name, email, password, setupKey } = req.body || {};

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: 'Missing JWT_SECRET environment variable'
            });
        }

        const existingAdminCount = await User.countDocuments({ role: 'admin' });
        if (existingAdminCount > 0) {
            return res.status(409).json({
                success: false,
                message: 'Admin already exists'
            });
        }

        if (process.env.ADMIN_SETUP_KEY) {
            if (!setupKey) {
                return res.status(403).json({
                    success: false,
                    message: 'Setup key is required'
                });
            }
            if (setupKey !== process.env.ADMIN_SETUP_KEY) {
                return res.status(403).json({
                    success: false,
                    message: 'Invalid setup key'
                });
            }
        }

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const passwordHash = await bcrypt.hash(String(password), 10);

        const adminUser = await User.create({
            name: (name || 'Admin').toString().trim(),
            email: normalizedEmail,
            password: passwordHash,
            role: 'admin'
        });

        let token;
        try {
            token = signToken(adminUser._id);
        } catch (tokenError) {
            await User.deleteOne({ _id: adminUser._id });
            throw tokenError;
        }

        res.status(201).json({
            success: true,
            token,
            user: {
                id: adminUser._id,
                name: adminUser.name,
                email: adminUser.email,
                role: adminUser.role
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.loginAdmin = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const user = await User.findOne({ email: normalizedEmail }).select('+password');
        if (!user || user.role !== 'admin') {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const isMatch = await bcrypt.compare(String(password), user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = signToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    } catch (error) {
        next(error);
    }
};

exports.listRegistrations = async (req, res, next) => {
    try {
        const registrations = await Registration.find({})
            .select('-ieeeMembershipCertificate.data -paymentScreenshot.data -payment.screenshot.data')
            .sort({ createdAt: -1 });

        const data = registrations.map(r => {
            const cert = r.ieeeMembershipCertificate;
            const hasIeeeCertificate = Boolean(
                (r.ieeeMember || 'no').toString().toLowerCase() === 'yes' &&
                cert &&
                (cert.contentType || cert.fileName)
            );

            return {
                ...r.toObject(),
                hasIeeeCertificate
            };
        });

        res.json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

exports.getRegistrationById = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid registration id'
            });
        }

        const registration = await Registration.findById(req.params.id).select('-ieeeMembershipCertificate.data -paymentScreenshot.data -payment.screenshot.data');
        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        res.json({ success: true, data: registration });
    } catch (error) {
        next(error);
    }
};

exports.viewIeeeCertificate = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid registration id'
            });
        }
        const registration = await Registration.findById(req.params.id).select('ieeeMembershipCertificate ieeeMember');
        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        if ((registration.ieeeMember || 'no').toString().toLowerCase() !== 'yes') {
            return res.status(404).json({
                success: false,
                message: 'IEEE certificate not available'
            });
        }

        const cert = registration.ieeeMembershipCertificate;
        if (!cert?.data || !cert?.contentType) {
            return res.status(404).json({
                success: false,
                message: 'IEEE certificate not available'
            });
        }

        res.setHeader('Content-Type', cert.contentType);
        res.setHeader('Content-Disposition', `inline; filename="${cert.fileName || 'ieee-certificate'}"`);
        return res.send(cert.data);
    } catch (error) {
        next(error);
    }
};
