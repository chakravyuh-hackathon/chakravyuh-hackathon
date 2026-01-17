const path = require('path');
const ejs = require('ejs');
const fs = require('fs').promises;

const templateCache = new Map();

const preloadTemplates = async () => {
    const templateNames = ['registration-confirmation', 'payment-confirmation'];
    const results = await Promise.allSettled(
        templateNames.map(async (templateName) => {
            const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.ejs`);
            if (templateCache.has(templatePath)) return;
            const template = await fs.readFile(templatePath, 'utf-8');
            templateCache.set(templatePath, template);
        })
    );
    const rejected = results.find((r) => r.status === 'rejected');
    if (rejected) {
        throw rejected.reason;
    }
};

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
    paymentConfirmation: (data) => loadTemplate('payment-confirmation', data),
    preloadTemplates
};
