const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
    getUsersCollection
} = require('../../config/database');

async function login(data) {

    const usersCollection = getUsersCollection();

    const user = await usersCollection.findOne({
        email: data.identifier
    });

    if (!user) {
        throw new Error('الحساب غير موجود');
    }

    const valid = await bcrypt.compare(
        data.password,
        user.password
    );

    if (!valid) {
        throw new Error('كلمة المرور خاطئة');
    }

    const token = jwt.sign({
        email: user.email,
        role: user.role
    }, process.env.JWT_SECRET);

    return {
        token,
        user
    };
}

async function register(data) {

    const usersCollection = getUsersCollection();

    const hashedPassword = await bcrypt.hash(data.password, 10);

    await usersCollection.insertOne({
        ...data,
        password: hashedPassword,
        role: 'student',
        status: 'pending'
    });

    return {
        success: true
    };
}

module.exports = {
    login,
    register
};
