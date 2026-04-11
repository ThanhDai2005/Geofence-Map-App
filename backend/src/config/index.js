const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];

// Validate critical env variables at startup
const missing = requiredEnv.filter(env => !process.env[env]);
if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

const config = {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: '7d',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 100 // limit each IP to 100 requests per windowMs
    },
    cache: {
        ttl: parseInt(process.env.CACHE_TTL) || 60, // 60 seconds
    },
    timeout: {
        ms: parseInt(process.env.REQUEST_TIMEOUT) || 10000, // 10 seconds
    }
};

console.log('[INIT] Configuration loaded and validated successfully');

module.exports = config;
