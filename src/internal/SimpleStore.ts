import _ = require("lodash");
import nconf = require("nconf");
import {ISimpleStore} from "../public/api/ISimpleStore";

export class SimpleStore implements ISimpleStore {

    namespace: string;

    constructor(namespace: string) {
        this.namespace = namespace;
    }

    /**
     * Checks if a value exists.
     *
     * @param {string} key
     * @returns {any}
     */
    exists(key: string): boolean {
        return !!nconf.get(this.namespace + ":" + key);
    }

    /**
     * Gets a value from the key.
     *
     * @param {string} key
     * @returns {any}
     */
    get(key: string): any {
        return nconf.get(this.namespace + ":" + key);
    }

    /**
     * Returns the entire store as an object.
     *
     * @returns {any}
     */
    asObject(): any {
        return nconf.get(this.namespace);
    }

    /**
     * Returns an array of values given by the key. If the value is not an array, returns an array with a single item
     * of the value.
     *
     * @param {string} key
     * @returns {Array<T>}
     */
    getAsArray<T>(key: string): Array<T> {
        const someVal: any = this.get(key);
        if (_.isArray(someVal)) {
            return someVal;
        } else if (someVal !== undefined && someVal !== null) {
            return [someVal];
        } else {
            return [];
        }
    }

    /**
     * Sets the key and value.
     *
     * @param {string} key
     * @param {primitives} value
     */
    set(key: string, value: any): void {
        nconf.set(this.namespace + ":" + key, value);
    }
}
