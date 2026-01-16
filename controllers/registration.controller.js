const Registration = require('../models/Registration');
const sendEmail = require('../utils/sendEmail');
const mongoose = require('mongoose');

const asTrimmedString = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
};

const getFrontendBaseUrl = () => {
    const envValue = (process.env.FRONTEND_URL || '').toString();
    const first = envValue
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)[0];
    return (first || 'http://localhost:3000').replace(/\/+$/, '');
};

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

        const fullNameValue = asTrimmedString(fullName);
        const emailValue = asTrimmedString(email);
        const phoneValue = asTrimmedString(phone);
        const collegeValue = asTrimmedString(college);
        const eventValue = asTrimmedString(event);
        const teamNameValue = asTrimmedString(teamName);

        req.body.fullName = fullNameValue;
        req.body.email = emailValue;
        req.body.phone = phoneValue;
        req.body.college = collegeValue;
        req.body.event = eventValue;

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
        if (!fullNameValue || !emailValue || !phoneValue || !collegeValue || !eventValue) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }

        // Phone validation (10 digits)
        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(phoneValue)) {
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
            if (!teamNameValue || !Array.isArray(teamMembers) || teamMembers.length < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Team name and at least 1 team member is required'
                });
            }

            req.body.teamName = teamNameValue;

            // Validate team members
            for (const member of teamMembers) {
                const memberName = asTrimmedString(member?.name);
                const memberEmail = asTrimmedString(member?.email);
                const memberPhone = asTrimmedString(member?.phone);
                if (!memberName || !memberEmail || !memberPhone) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each team member must have name, email, and phone'
                    });
                }
                if (!emailRegex.test(memberEmail)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid email format for team member: ${memberName}`
                    });
                }

                member.name = memberName;
                member.email = memberEmail;
                member.phone = memberPhone;
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
            email: emailValue,
            event: eventValue
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'You have already registered for this event'
            });
        }

        // Generate registration ID
        const registrationId = `CHK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const requiredAmount = normalizedIeeeMember === 'yes' ? 1000 : 1200;

        // Create registration
        const registration = await Registration.create({
            ...req.body,
            registrationId,
            payment: {
                amount: requiredAmount,
                currency: 'INR',
                status: 'created'
            },
            status: 'pending_payment',
            registeredAt: new Date()
        });

        // Send confirmation email
        try {
            const frontendUrl = getFrontendBaseUrl();
            const paymentLink = `${frontendUrl}/payment/${registration._id}`;
            await sendEmail({
                to: emailValue,
                subject: `Chakravyuh 2.0 - Registration Processing (${registrationId})`,
                template: 'registrationConfirmation',
                context: {
                    fullName: fullNameValue,
                    email: emailValue,
                    event: eventValue,
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
        console.error('createRegistration error:', {
            message: error?.message,
            name: error?.name,
            code: error?.code,
            stack: error?.stack
        });
        next(error);
    }
};