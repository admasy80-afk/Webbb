const uploadService = require('./upload.service');

async function uploadCourse(req, res) {
    try {
        const result = await uploadService.handleUpload(req);

        return res.status(200).json(result);

    } catch (err) {
        return res.status(500).json({
            message: err.message
        });
    }
}

module.exports = {
    uploadCourse
};
