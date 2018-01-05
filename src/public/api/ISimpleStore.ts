/**
 * A simple key-value in-memory storage. Mostly used to store configuration options.
 */
export interface ISimpleStore {

    /**
     * Gets a value from the key.
     *
     * @param {string} key
     * @returns {any}
     */
    get(key: string): any;

    /**
     * Returns an array of values given by the key. If the value is not an array, returns an array with a single item
     * of the value.
     *
     * @param {string} key
     * @returns {Array<T>}
     */
    getAsArray<T>(key: string): Array<T>;

    /**
     * Sets the key and value.
     *
     * @param {string} key
     * @param {primitives} value
     */
    set(key: string, value: any): void;
}