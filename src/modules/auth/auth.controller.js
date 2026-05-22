const authService = require('./auth.service');

async function login(req, res) {

    try {

        const result = await authService.login(req.body);

        res.json(result);

    } catch (err) {

        res.status(500).json({
            message: err.message
        });
    }
}

async function register(req, res) {

    try {

        const result = await authService.register(req.body);

        res.json(result);

    } catch (err) {

        res.status(500).json({
            message: err.message
        });
    }
}

module.exports = {
    login,
    register
};
