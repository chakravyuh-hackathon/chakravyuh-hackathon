const multer = require('multer');

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png'
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error('Only PDF, JPG, PNG files are allowed'));
        }

        cb(null, true);
    }
});

module.exports = upload;
