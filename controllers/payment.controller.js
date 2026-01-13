const razorpay = require('../utils/razorpay');
const crypto = require('crypto');
const Registration = require('../models/Registration');
const sendEmail = require('../utils/sendEmail');
const generateQR = require('../utils/generateQR');

// Create Razorpay order
exports.createOrder = async (req, res, next) => {
    try {
        const { registrationId, currency = 'INR' } = req.body;

        if (!registrationId) {
            return res.status(400).json({
                success: false,
                message: 'Registration ID is required'
            });
        }

        // Verify registration exists and is pending payment
        const registration = await Registration.findOne({
            _id: registrationId,
            status: 'pending_payment'
        });

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found or payment already processed'
            });
        }

        const isIeeeMember = (registration.ieeeMember || 'no').toString().toLowerCase() === 'yes';
        const nonIeeeAmount = Number(
            process.env.PAYMENT_NON_IEEE_AMOUNT ||
            process.env.PAYMENT_BASE_AMOUNT ||
            1013.86
        );
        const ieeeAmount = Number(process.env.PAYMENT_IEEE_AMOUNT || 811.86);

        if (!Number.isFinite(nonIeeeAmount) || nonIeeeAmount <= 0) {
            return res.status(500).json({
                success: false,
                message: 'Invalid payment configuration'
            });
        }

        if (!Number.isFinite(ieeeAmount) || ieeeAmount <= 0) {
            return res.status(500).json({
                success: false,
                message: 'Invalid payment configuration'
            });
        }

        const originalAmount = nonIeeeAmount;
        const finalAmount = isIeeeMember ? ieeeAmount : nonIeeeAmount;
        const safeDiscountPercent = isIeeeMember
            ? Number(((1 - finalAmount / originalAmount) * 100).toFixed(2))
            : 0;

        const options = {
            amount: Math.round(finalAmount * 100), // Convert to paise
            currency,
            receipt: `chk_${registrationId}`,
            payment_capture: 1,
            notes: {
                registrationId: registration._id.toString(),
                event: registration.event
            }
        };

        const order = await razorpay.orders.create(options);

        // Update registration with order ID
        await Registration.findByIdAndUpdate(registrationId, {
            $set: {
                payment: {
                    orderId: order.id,
                    amount: finalAmount,
                    originalAmount: originalAmount,
                    discountPercent: safeDiscountPercent,
                    currency: currency,
                    status: 'created'
                }
            }
        });

        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt
            }
        });
    } catch (error) {
        next(error);
    }
};

// Verify payment and update registration
exports.verifyPayment = async (req, res, next) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        registrationId
    } = req.body;

    try {
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !registrationId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification data'
            });
        }

        // Verify payment signature
        const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(sign)
            .digest('hex');

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // 🔴 REQUIRED FIX: include email and teamMembers
        const registration = await Registration.findById(registrationId).select(
            'registrationId fullName event isTeam teamName email teamMembers'
        );

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        // Generate QR code for the registration
        const port = process.env.PORT || 5000;
        let publicBaseUrl =
            process.env.BACKEND_PUBLIC_URL ||
            `http://localhost:${port}`;
        publicBaseUrl = publicBaseUrl
            .replace(/\$\{PORT\}|\$PORT/g, String(port))
            .replace(/\/+$/, '');

        const qrUrl = `${publicBaseUrl}/api/registrations/qr/${encodeURIComponent(registration.registrationId)}`;
        const qrCode = await generateQR(qrUrl);

        // Update registration with payment and QR code
        const updatedRegistration = await Registration.findByIdAndUpdate(
            registrationId,
            {
                $set: {
                    'payment.paymentId': razorpay_payment_id,
                    'payment.status': 'captured',
                    'payment.paidAt': new Date(),
                    status: 'confirmed',
                    qrCode: qrCode
                }
            },
            { new: true }
        );

        if (!updatedRegistration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        // Send confirmation email with QR code to all team members
        try {
            // Collect all emails (registrant + team members)
            const recipients = [
                { name: updatedRegistration.fullName, email: updatedRegistration.email },
                ...(updatedRegistration.teamMembers || []).map(m => ({ name: m.name, email: m.email }))
            ];

            // Remove duplicates based on email
            const uniqueRecipients = Array.from(
                new Map(recipients.map(item => [item.email, item])).values()
            );

            // Prepare QR code attachment
            const base64Data = qrCode.split(';base64,').pop();

            const attachments = [{
                filename: 'qrcode.png',
                content: base64Data,
                encoding: 'base64',
                cid: 'qrcode'
            }];

            setImmediate(async () => {
                try {
                    await Promise.allSettled(
                        uniqueRecipients.map((recipient) =>
                            sendEmail({
                                to: recipient.email,
                                subject: `Chakravyuh 2.0 - Registration Confirmed (${updatedRegistration.registrationId})`,
                                template: 'paymentConfirmation',
                                context: {
                                    fullName: recipient.name,
                                    event: updatedRegistration.event,
                                    registrationId: updatedRegistration.registrationId,
                                    teamName: updatedRegistration.isTeam ? (updatedRegistration.teamName || '') : '',
                                    paymentId: razorpay_payment_id,
                                    qrCode: 'cid:qrcode'
                                },
                                attachments
                            })
                        )
                    );
                } catch (emailError) {
                    console.error('Failed to send payment confirmation email:', emailError);
                }
            });

        } catch (emailError) {
            console.error('Failed to send payment confirmation email:', emailError);
        }

        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                registrationId: updatedRegistration._id,
                status: 'confirmed',
                qrCode: qrCode
            }
        });
    } catch (error) {
        next(error);
    }
};
