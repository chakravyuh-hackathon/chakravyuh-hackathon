const nodemailer = require('nodemailer');
const emailTemplates = require('./emailTemplates');

const EMAIL_USER = (process.env.EMAIL_USER || '').toString().trim();
const EMAIL_PASS = (process.env.EMAIL_PASS || '').toString().replace(/\s+/g, '');

const isPlaceholderCredentials = (user, pass) => {
    const u = (user || '').toString().trim();
    const p = (pass || '').toString().trim();
    return (
        !u ||
        !p ||
        u === 'your-email@gmail.com' ||
        u === 'your_email@gmail.com' ||
        p === 'your-app-specific-password' ||
        p === 'your_email_app_password'
    );
};

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    pool: true,
    maxConnections: Number(process.env.EMAIL_MAX_CONNECTIONS) || 3,
    maxMessages: Number(process.env.EMAIL_MAX_MESSAGES) || 100,
    connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS) || 10000,
    greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS) || 10000,
    socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS) || 20000,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

let warmupPromise = null;

const warmup = async () => {
    if (isPlaceholderCredentials(EMAIL_USER, EMAIL_PASS)) {
        return null;
    }

    if (!EMAIL_USER || !EMAIL_PASS) {
        return null;
    }

    if (warmupPromise) return warmupPromise;

    warmupPromise = transporter.verify().catch((err) => {
        warmupPromise = null;
        console.error('Email transporter warmup failed:', err?.message || err);
        return null;
    });

    return warmupPromise;
};

const sendEmail = async (options) => {
    // Check for placeholder credentials
    if (isPlaceholderCredentials(EMAIL_USER, EMAIL_PASS)) {
        console.warn('\n\x1b[33m%s\x1b[0m', '⚠️  WARNING: You are using default placeholder email credentials!');
        console.warn('\x1b[36m%s\x1b[0m', 'To fix sending emails:');
        console.warn('1. Go to your Google Account > Security');
        console.warn('2. Enable 2-Step Verification');
        console.warn('3. Create an App Password (search "App Passwords")');
        console.warn('4. Update backend/.env with your email and the 16-character App Password\n');
        return null;
    }

    try {
        const { to, cc, bcc, subject, template, context, attachments = [] } = options;

        // If template is provided, render it
        let html = options.html;
        if (template) {
            html = await emailTemplates[template](context);
        }

        if (!html) {
            throw new Error('Either html or template must be provided');
        }

        const mailOptions = {
            from: `"Chakravyuh 2.0" <${EMAIL_USER}>`,
            to: Array.isArray(to) ? to : [to],
            cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
            bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
            subject,
            html,
            attachments: [...attachments]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('Email sending failed:', error.message);
        if (error.code === 'EAUTH') {
            console.error('\x1b[31m%s\x1b[0m', 'Authentication Error: Please check your EMAIL_USER and EMAIL_PASS in .env.');
            console.error('Note: For Gmail, you MUST use an "App Password", not your login password.');
        }
        return null;
    }
};

sendEmail.warmup = warmup;

module.exports = sendEmail;
