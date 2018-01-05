
export interface IRedisCacheOptions {

    /**
     * location is a String pointing at the root namespace of the data in redis.
     *
     * Default: hammerpack
     */
    location?: string;

    /**
     * Where to find the Redis host.
     *
     * Default: 127.0.0.1
     */
    host?: string;

    /**
     * Port on which Redis is running.
     *
     * Default: 6379
     */
    port?: number;

    /**
     * Alternative to using host and port. Use e.g. if you have cloud Redis.
     */
    url?: string;
}