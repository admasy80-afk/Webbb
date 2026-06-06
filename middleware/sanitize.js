const { logger } = require('../config/db');

module.exports = (req, res, next) => {
    const sanitize = (obj) => {
        if (obj instanceof Object) {
            for (let key in obj) {
                if (/^\$/.test(key)) {
                    logger.warn({ key, path: req.path, ip: req.ip }, "🚨 تم رصد ومسح كود مشبوه");
                    delete obj[key];
                } else if (typeof obj[key] === 'object') {
                    sanitize(obj[key]);
                }
            }
        }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
};
