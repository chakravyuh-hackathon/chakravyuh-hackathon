const Registration = require('../models/Registration');
const sendEmail = require('../utils/sendEmail');
const mongoose = require('mongoose');

exports.createRegistration = async (req, res, next) => {
    try {
        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                message: 'Database unavailable. Please try again later.'
            });
        }

        if (!req.body) {
            return res.status(400).json({
                success: false,
                message: 'Invalid form data'
            });
        }

        const {
            fullName,
            email,
            phone,
            college,
            event,
            ieeeMember,
            ieeeId,
            isTeam,
            teamName
        } = req.body;

        let teamMembers = req.body.teamMembers;
        if (typeof teamMembers === 'string') {
            try {
                teamMembers = JSON.parse(teamMembers);
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid teamMembers data'
                });
            }
        }

        const normalizedIsTeam = typeof isTeam === 'string' ? isTeam === 'true' : Boolean(isTeam);

        // Validation
        if (!fullName?.trim() || !email?.trim() || !phone?.trim() || !college?.trim() || !event) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }

        // Phone validation (10 digits)
        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid 10-digit Indian phone number'
            });
        }

        // IEEE validation
        const normalizedIeeeMember = (ieeeMember || 'no').toString().toLowerCase();
        if (!['yes', 'no'].includes(normalizedIeeeMember)) {
            return res.status(400).json({
                success: false,
                message: 'IEEE Member must be yes or no'
            });
        }

        if (normalizedIeeeMember === 'yes') {
            if (!ieeeId?.toString().trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'IEEE ID is required for IEEE members'
                });
            }

            if (!req.file || !req.file.buffer || !req.file.mimetype) {
                return res.status(400).json({
                    success: false,
                    message: 'IEEE Membership Certificate is required for IEEE members'
                });
            }

            req.body.ieeeMembershipCertificate = {
                fileName: req.file.originalname,
                contentType: req.file.mimetype,
                data: req.file.buffer
            };
        } else {
            req.body.ieeeId = undefined;
            req.body.ieeeMembershipCertificate = undefined;
        }

        req.body.ieeeMember = normalizedIeeeMember;

        // Team validation
        if (normalizedIsTeam) {
            if (!teamName?.trim() || !Array.isArray(teamMembers) || teamMembers.length < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Team name and at least 1 team member is required'
                });
            }

            // Validate team members
            for (const member of teamMembers) {
                if (!member.name?.trim() || !member.email?.trim() || !member.phone?.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each team member must have name, email, and phone'
                    });
                }
                if (!emailRegex.test(member.email)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid email format for team member: ${member.name}`
                    });
                }
            }

            req.body.teamMembers = teamMembers;
        } else {
            // If not a team, ensure teamMembers is empty/undefined to prevent validation errors
            req.body.teamMembers = [];
            req.body.teamName = undefined;
        }

        req.body.isTeam = normalizedIsTeam;

        // Check for existing registration
        const existing = await Registration.findOne({
            email: req.body.email,
            event: req.body.event
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'You have already registered for this event'
            });
        }

        // Generate registration ID
        const registrationId = `CHK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Create registration
        const registration = await Registration.create({
            ...req.body,
            registrationId,
            status: 'pending_payment',
            registeredAt: new Date()
        });

        // Send confirmation email
        try {
            const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
            const paymentLink = `${frontendUrl}/payment/${registration._id}`;
            await sendEmail({
                to: email,
                subject: `Chakravyuh 2.0 - Registration Confirmation (${registrationId})`,
                template: 'registrationConfirmation',
                context: {
                    fullName,
                    email,
                    event,
                    registrationId,
                    paymentRequired: true,
                    paymentLink,
                    year: new Date().getFullYear()
                }
            });
        } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
            // Don't fail the registration if email fails
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please complete the payment.',
            data: {
                ...registration._doc,
                paymentRequired: true
            }
        });

    } catch (error) {
        next(error);
    }
};