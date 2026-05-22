const https = require('https');

const {
    S3Client
} = require('@aws-sdk/client-s3');

const {
    NodeHttpHandler
} = require('@smithy/node-http-handler');

const buildHttpHandler = () => new NodeHttpHandler({
    httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 100,
        maxFreeSockets: 20,
        timeout: 120000
    })
});

const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    },
    requestHandler: buildHttpHandler()
});

module.exports = {
    r2Client,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME
};
