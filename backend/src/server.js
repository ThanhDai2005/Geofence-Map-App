require('dotenv').config();
const config = require('./config');
const app = require('./app');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const { initializeSocket } = require('./socket/audio-queue.socket');

const PORT = config.port;

const startServer = async () => {
    await connectDB();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    const io = new Server(server, {
        cors: {
            origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
            methods: ['GET', 'POST']
        }
    });

    // Initialize audio queue socket handlers
    initializeSocket(io);

    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} [${config.env}]`);
        console.log(`Socket.IO initialized for real-time audio queue`);
    });
};

startServer();
