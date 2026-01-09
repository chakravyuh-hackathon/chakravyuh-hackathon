const server = require('../server');

const app = server;
const { connectMongo } = server;

module.exports = async (req, res) => {
    try {
        await connectMongo();
        return app(req, res);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};
