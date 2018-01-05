/**
 * Stores key-value pairs that are persisted somewhere. Has multiple levels of caching -- memory and persisted store.
 *
 * The persisted store can be flushed as necessary.
 */
export interface ICache {

    /**
     * Gets the value for the given key synchronously. Only uses the memory cache -- does not hit the persisted index.
     *
     * If there is no value for the given key in memory, the value will be null or undefined.
     *
     * @param {string} key
     * @returns {string}
     */
    getMemSync(key: string): any;

    /**
     * Sets the key and value pair synchronously. Only uses the memory cache -- does not hit the persisted index. Using
     * this might be more performant if you were to set a lot of values (high write frequency) and can do a batch flush
     * into the persisted store all at once.
     *
     * If value is null or undefined, will delete the entry for the key.
     *
     * If you use this method, you will also need to call flush() once you are done with all the setMemSync calls
     * so that all values that you have set can be written out to the persisted cache in an asynchronous manner.
     *
     * @param {string} key
     * @param {string} value
     */
    setMemSync(key: string, value: any): ICache;

    /**
     * Gets the value for the given key asynchronously. Prefer this over getMemSync as it will hit the persisted cache
     * if the value is not in the memory cache.
     *
     * If there is no value for the given key, the value will be null or undefined.
     *
     * @param {string} key
     * @param {(value: string) => void} callback
     */
    get(key: string, callback: (err?: Error, value?: any) => void): void;

    /**
     * Sets the value for the given key. Prefer this over setMemSync as it will hit the persisted cache.
     *
     * If value is null or undefined, will delete the entry for the key.
     *
     * If you use this method, you do not have to call flush().
     *
     * @param {string} key
     * @param {string} value
     * @param {(err: Error) => void} callback
     */
    set(key: string, value: any, callback: (err?: Error) => void): void;

    /**
     * Flushes into the persisted store the key-value pairs that were inserted into the memory store using setMemSync.
     *
     * @param {(err: Error) => void} callback
     */
    flush(callback: (err?: Error) => void): void;

    /**
     * Clears the items that are waiting to be flushed to the persisted store.
     */
    clearFlushQueue(): void;

    /**
     * Clears the in-memory cache.
     */
    clearMem(): void;

}