import async = require("async");
import {ICachePluginParams} from "../../public/options/ICachePluginParams";
import redisdown = require("redisdown");
import {IRedisCacheOptions} from "./IRedisCacheOptions";
import {ICachePluginResult} from "../../public/plugins/ICachePlugin";

export function redisCache(
    params: ICachePluginParams, result: async.AsyncResultCallback<ICachePluginResult, Error>): void {

    const options: IRedisCacheOptions = params.options as IRedisCacheOptions || {};
    if (!options.url) {
        if (!options.host) {
            options.host = "127.0.0.1";
        }
        if (!options.port) {
            options.port = 6379;
        }
    }

    result(null, {
        db: redisdown(options.location || "hammerpack"),
        options: options
    } as ICachePluginResult);
}