const mongoose = require('mongoose');
const Registration = require('../models/Registration');
const sendEmail = require('../utils/sendEmail');
const generateQR = require('../utils/generateQR');

const getBackendPublicBaseUrl = () => {
    const port = process.env.PORT || 5000;
    let base = (process.env.BACKEND_PUBLIC_URL || `http://localhost:${port}`).toString();
    return base.replace(/\$\{PORT\}|\$PORT/g, String(port)).replace(/\/+$/, '');
};

const normalizeUtr = (value) => String(value || '').replace(/\D/g, '').trim();

/* ------------------ SUBMIT UPI PROOF ------------------ */
exports.submitUPIProof = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid registration id' });
        }

        const utrNumber = normalizeUtr(req.body?.utrNumber);
        if (!utrNumber || utrNumber.length !== 12) {
            return res.status(400).json({ success: false, message: 'UTR must be 12 digits' });
        }

        if (!req.file?.buffer || !req.file?.mimetype) {
            return res.status(400).json({ success: false, message: 'Payment screenshot required' });
        }

        const registration = await Registration.findById(id);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.status === 'confirmed') {
            return res.json({ success: true, message: 'Already confirmed' });
        }

        registration.utrNumber = utrNumber;
        registration.payment = {
            ...registration.payment,
            utrNumber,
            screenshot: {
                fileName: req.file.originalname,
                contentType: req.file.mimetype,
                data: req.file.buffer
            }
        };
        registration.status = 'under_review';

        await registration.save();

        return res.json({
            success: true,
            message: 'Payment proof submitted successfully'
        });
    } catch (err) {
        next(err);
    }
};

/* ------------------ VIEW SCREENSHOT ------------------ */
exports.viewPaymentScreenshot = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid id' });
        }

        const registration = await Registration.findById(id);
        if (!registration?.payment?.screenshot?.data) {
            return res.status(404).json({ success: false, message: 'Screenshot not found' });
        }

        const s = registration.payment.screenshot;
        res.setHeader('Content-Type', s.contentType);
        res.setHeader('Content-Disposition', `inline; filename="${s.fileName}"`);
        res.send(s.data);
    } catch (err) {
        next(err);
    }
};

/* ------------------ FINAL ADMIN APPROVAL ------------------ */
exports.finalApprove = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid registration id' });
        }

        const registration = await Registration.findById(id);
        if (!registration) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        if (registration.status !== 'under_review') {
            return res.status(400).json({ success: false, message: 'Not under review' });
        }

        /* Generate QR */
        const baseUrl = getBackendPublicBaseUrl();
        const qrUrl = `${baseUrl}/api/registrations/qr/${registration.registrationId}`;
        const qrCode = await generateQR(qrUrl);

        /* Update payment */
        registration.payment = {
            ...registration.payment,
            paymentId: registration.payment?.utrNumber || 'UPI',
            status: 'captured',
            paidAt: new Date()
        };
        registration.status = 'confirmed';
        registration.qrCode = qrCode;

        await registration.save();

        /* -------- SEND EMAIL (ASYNC) -------- */
        const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
        const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

        const leaderEmail = normalizeEmail(registration.email);
        const memberEmails = (registration.teamMembers || [])
            .map((m) => normalizeEmail(m?.email))
            .filter(Boolean);

        const uniqueEmails = Array.from(
            new Set([leaderEmail, ...memberEmails].filter((e) => e && isValidEmail(e)))
        );

        const recipients = uniqueEmails;

        const EMAIL_USER = (process.env.EMAIL_USER || '').toString().trim();
        const EMAIL_PASS = (process.env.EMAIL_PASS || '').toString().replace(/\s+/g, '');
        const emailConfigured = Boolean(
            EMAIL_USER &&
            EMAIL_PASS &&
            EMAIL_USER !== 'your-email@gmail.com' &&
            EMAIL_USER !== 'your_email@gmail.com' &&
            EMAIL_PASS !== 'your-app-specific-password' &&
            EMAIL_PASS !== 'your_email_app_password'
        );

        const emailQueued = Boolean(emailConfigured && recipients.length);
        const emailRecipients = recipients.length;

        const frontendBaseUrl = (() => {
            const envValue = (process.env.FRONTEND_URL || '').toString();
            const first = envValue
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean)[0];
            return (first || 'http://localhost:3000').replace(/\/+$/, '');
        })();

        const ticketUrl = `${frontendBaseUrl}/registration/success?id=${encodeURIComponent(
            registration.registrationId
        )}`;

        // Respond immediately so the admin UI is fast and Excel can be generated instantly.
        res.json({
            success: true,
            message: 'Payment approved',
            data: {
                registrationId: registration.registrationId,
                status: 'confirmed',
                qrCode,
                emailQueued,
                emailRecipients
            }
        });

        if (emailQueued) {
            const to = leaderEmail && isValidEmail(leaderEmail) ? leaderEmail : recipients[0];
            const bcc = recipients.filter((email) => email !== to);
            const qrBase64 = typeof qrCode === 'string' && qrCode.includes('base64,')
                ? qrCode.split('base64,')[1]
                : qrCode;

            setImmediate(async () => {
                try {
                    await sendEmail({
                        to,
                        bcc: bcc.length ? bcc : undefined,
                        subject: `Chakravyuh 2.0 - Registration Confirmed`,
                        template: 'paymentConfirmation',
                        context: {
                            fullName: registration.isTeam
                                ? registration.teamName || registration.fullName
                                : registration.fullName,
                            teamName: registration.isTeam ? (registration.teamName || '') : '',
                            event: registration.event,
                            registrationId: registration.registrationId,
                            paymentId: registration.payment.paymentId,
                            qrCode: 'cid:qrcode',
                            ticketUrl
                        },
                        attachments: [
                            {
                                filename: 'qrcode.png',
                                content: qrBase64,
                                encoding: 'base64',
                                cid: 'qrcode'
                            }
                        ]
                    });
                } catch (emailErr) {
                    console.error('Payment confirmation email failed:', emailErr?.message || emailErr);
                }
            });
        }

        return;

    } catch (err) {
        next(err);
    }
};

exports.adminApprovePayment = exports.finalApprove;
