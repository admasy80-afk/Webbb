const express = require('express');
const path = require('path');
const compression = require('compression');

const securityMiddleware = require('./middleware/security');

const authRoutes = require('./modules/auth/auth.routes');
const uploadRoutes = require('./modules/upload/upload.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const studentRoutes = require('./modules/student/student.routes');
const coursesRoutes = require('./modules/courses/courses.routes');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

securityMiddleware(app);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/courses', coursesRoutes);

app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API غير موجود' });
});

module.exports = app;
