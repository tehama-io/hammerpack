import async = require("async");
import {ICachePluginParams} from "../options/ICachePluginParams";

/**
 * Called with cache options that the user supplies. Should return with a LevelDown compatible database in the callback.
 */
export type ICachePlugin = (params: ICachePluginParams, result: async.AsyncResultCallback<ICachePluginResult, Error>) => void;

export interface ICachePluginResult {
    /**
     * Some LevelDOWN compliant store.
     */
    db: object;

    /**
     * Set of options that will be passed down to the store when it is opened.
     */
    options?: object;
}