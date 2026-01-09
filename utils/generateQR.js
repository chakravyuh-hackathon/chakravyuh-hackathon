const QRCode = require('qrcode');

const generateQR = async (data, options = {}) => {
    try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        return await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'H',
            type: 'image/png',
            ...options
        });
    } catch (err) {
        console.error('Error generating QR code:', err);
        throw err;
    }
};

module.exports = generateQR;
