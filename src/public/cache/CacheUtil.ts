import _ = require("lodash");
import {ICache} from "./ICache";
import {IFileCacheKey} from "./IFileCacheKey";
import {IFileCacheValue} from "./IFileCacheValue";
import {IPluginCacheKey} from "./IJobCacheKey";

export class CacheUtil {

    private cache: ICache;

    constructor(cache: ICache) {
        this.cache = cache;
    }

    decomposeFileKey(key: string): IFileCacheKey {
        const ret: IFileCacheKey = {
            filename: null,
            hash: null
        };

        if (key) {
            const indexSep: number = key.indexOf(":");
            if (indexSep > 0) {
                ret.filename = key.substring(0, indexSep);
                ret.hash = key.substring(indexSep + 1, key.length);
            } else {
                ret.filename = key;
            }
        }

        return ret;
    }

    composeFileKey(key: IFileCacheKey): string {
        let ret: string = "";
        if (key) {
            if (key.filename) {
                ret = key.filename;
            }

            ret += ":";

            if (key.hash) {
                ret += key.hash;
            }

            return ret;
        } else {
            throw new Error("Key cannot be null");
        }
    }

    getFile(key: string|IFileCacheKey, callback: (error: Error, value: IFileCacheValue) => void): void {
        const cacheKey: string = _.isString(key) ? key : this.composeFileKey(key as IFileCacheKey);
        this.cache.get(cacheKey, callback);
    }

    setFile(key: string|IFileCacheKey, value: IFileCacheValue, callback: (error?: Error) => void): void {
        const cacheKey: string = _.isString(key) ? key : this.composeFileKey(key as IFileCacheKey);
        this.cache.setMemSync(cacheKey, value);
        callback();
    }

    flushWrites(callback: (error: Error) => void): void {
        this.cache.flush(callback);
    }

    composePluginKey(key: IPluginCacheKey): string {
        if (!key || !key.pluginName) {
            throw new Error("Need a plugin name.");
        }

        return key.pluginName + (key.key ? (":" + key.key) : "");
    }

    decomposePluginKey(key: string): IPluginCacheKey {
        const ret: IPluginCacheKey = {
            pluginName: null,
            key: null
        };

        if (key) {
            const indexSep: number = key.indexOf(":");
            if (indexSep > 0) {
                ret.pluginName = key.substring(0, indexSep);
                ret.key = key.substring(indexSep + 1, key.length);
            } else {
                ret.pluginName = key;
            }
        }

        return ret;
    }

    getPlugin(key: string|IPluginCacheKey, callback: (error: Error, value: any) => void): void {
        const cacheKey: string = _.isString(key) ? key : this.composePluginKey(key as IPluginCacheKey);
        this.cache.get(cacheKey, callback);
    }

    setPlugin(key: string|IPluginCacheKey, value: any, callback: (error?: Error) => void): void {
        const cacheKey: string = _.isString(key) ? key : this.composePluginKey(key as IPluginCacheKey);
        this.cache.setMemSync(cacheKey, value);
        callback();
    }



}