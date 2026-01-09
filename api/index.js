const server = require('../server');

const app = server;
const { connectMongo } = server;

module.exports = async (req, res) => {
    const origin = req.headers.origin;

    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        await connectMongo();
        return app(req, res);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Internal Server Error'
        });
    }
};
