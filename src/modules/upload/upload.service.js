const crypto = require('crypto');
const busboy = require('busboy');

const {
    Upload
} = require('@aws-sdk/lib-storage');

const {
    PutObjectCommand
} = require('@aws-sdk/client-s3');

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    r2Client,
    R2_BUCKET_NAME
} = require('../../config/r2');

const logger = require('../../config/logger');
const formatBytes = require('../../utils/formatBytes');
const { getDB } = require('../../config/database');

async function handleUpload(req) {

    return new Promise((resolve, reject) => {

        const bb = busboy({
            headers: req.headers,
            limits: {
                fileSize: 2 * 1024 * 1024 * 1024
            }
        });

        let courseData = {};

        bb.on('field', (name, value) => {
            courseData[name] = value;
        });

        bb.on('file', async (name, file, info) => {

            try {

                const ext = 'mp4';

                const fileKey = `videos/${crypto.randomUUID()}.${ext}`;

                const upload = new Upload({
                    client: r2Client,
                    params: {
                        Bucket: R2_BUCKET_NAME,
                        Key: fileKey,
                        Body: file,
                        ContentType: info.mimeType
                    }
                });

                await upload.done();

                const db = getDB();

                await db.collection('courses').insertOne({
                    courseName: courseData.courseName,
                    grade: courseData.grade,
                    fileKey,
                    createdAt: new Date()
                });

                resolve({
                    success: true,
                    message: 'تم رفع الفيديو'
                });

            } catch (err) {
                reject(err);
            }
        });

        req.pipe(bb);
    });
}

module.exports = {
    handleUpload
};
