const nodemailer = require('nodemailer');
const emailTemplates = require('./emailTemplates');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (options) => {
    // Check for placeholder credentials
    if (process.env.EMAIL_USER === 'your-email@gmail.com' ||
        process.env.EMAIL_PASS === 'your-app-specific-password') {
        console.warn('\n\x1b[33m%s\x1b[0m', '⚠️  WARNING: You are using default placeholder email credentials!');
        console.warn('\x1b[36m%s\x1b[0m', 'To fix sending emails:');
        console.warn('1. Go to your Google Account > Security');
        console.warn('2. Enable 2-Step Verification');
        console.warn('3. Create an App Password (search "App Passwords")');
        console.warn('4. Update backend/.env with your email and the 16-character App Password\n');
        return null;
    }

    try {
        const { to, subject, template, context, attachments = [] } = options;

        // If template is provided, render it
        let html = options.html;
        if (template) {
            html = await emailTemplates[template](context);
        }

        if (!html) {
            throw new Error('Either html or template must be provided');
        }

        const mailOptions = {
            from: `"Chakravyuh 2.0" <${process.env.EMAIL_USER}>`,
            to: Array.isArray(to) ? to : [to],
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

module.exports = sendEmail;
