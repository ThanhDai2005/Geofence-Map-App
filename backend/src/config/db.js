const mongoose = require('mongoose');
const config = require('./index');

const connectDB = async () => {
    try {
        const uri = config.mongoUri;
        await mongoose.connect(uri);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
