class Cache {
    constructor(defaultTtlSeconds = 60) {
        this.cache = new Map();
        this.defaultTtl = defaultTtlSeconds * 1000;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    set(key, value, ttlSeconds = null) {
        const ttl = (ttlSeconds ? ttlSeconds * 1000 : this.defaultTtl);
        const expiry = Date.now() + ttl;
        this.cache.set(key, { value, expiry });
    }

    delete(key) {
        this.cache.delete(key);
    }

    // Prevents memory leaks by cleaning expired items
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = Cache;
