const path = require('path');
const ejs = require('ejs');
const fs = require('fs').promises;

const templateCache = new Map();

const loadTemplate = async (templateName, data) => {
    try {
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.ejs`);
        let template = templateCache.get(templatePath);
        if (!template) {
            template = await fs.readFile(templatePath, 'utf-8');
            templateCache.set(templatePath, template);
        }
        return ejs.render(template, { ...data, year: new Date().getFullYear() });
    } catch (error) {
        console.error('Error loading email template:', error);
        throw error;
    }
};

module.exports = {
    registrationConfirmation: (data) => loadTemplate('registration-confirmation', data),
    paymentConfirmation: (data) => loadTemplate('payment-confirmation', data)
};
