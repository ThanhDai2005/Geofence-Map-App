require('dotenv').config();
const config = require('./config');
const app = require('./app');
const connectDB = require('./config/db');

const PORT = config.port;

const startServer = async () => {
    await connectDB();
    
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} [${config.env}]`);
    });
};

startServer();
