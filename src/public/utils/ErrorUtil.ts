import _ = require("lodash");

export class ErrorUtil {
    static customize(e: Error | string, message: string): Error {
        if (!e) {
            return new Error(message);
        } else if (_.isString(e)) {
            return new Error(message + "\n" + e);
        } else {
            (e as Error).message = message + "\n" + (e as Error).message;
            return e;
        }
    }

    /**
     * Stringifies an object including Errors (which cannot be stringified with JSON.stringify).
     *
     * @param obj
     * @returns {string}
     */
    static stringify(obj: any): string {
        return JSON.stringify(this.recursivePropertyFinder(obj), null, "\t");
    }

    private static recursivePropertyFinder(obj): object {
        if (obj === Object.prototype) {
            return {};
        } else {
            return _.reduce(Object.getOwnPropertyNames(obj),
                function copy(result, value, key) {
                    if (!_.isFunction(obj[value])) {
                        if (_.isObject(obj[value])) {
                            result[value] = ErrorUtil.recursivePropertyFinder(obj[value]);
                        } else {
                            result[value] = obj[value];
                        }
                    }
                    return result;
                }, ErrorUtil.recursivePropertyFinder(Object.getPrototypeOf(obj))
            );
        }
    }
}