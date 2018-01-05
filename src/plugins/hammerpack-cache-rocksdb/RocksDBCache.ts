import async = require("async");
import {ICachePluginParams} from "../../public/options/ICachePluginParams";
import rocksdb = require("rocksdb");
import {IRocksDBCacheOptions} from "./IRocksDBCacheOptions";
import {PathUtils} from "../../public/utils/PathUtils";
import * as path from "path";
import {ICachePluginResult} from "../../public/plugins/ICachePlugin";

export function rocksdbCache(
    params: ICachePluginParams, result: async.AsyncResultCallback<ICachePluginResult, Error>): void {

    const rocksOptions: IRocksDBCacheOptions = params.options as IRocksDBCacheOptions || {};

    // tslint:disable-next-line
    let cacheDir: string = rocksOptions["cache-directory"];
    if (!cacheDir) {
        cacheDir = path.resolve(params.config.hammerpackDir, ".cache");
    } else {
        cacheDir = PathUtils.getAsAbsolutePath(cacheDir, params.config.workingDir);
    }

    result(null, {
        db: rocksdb(cacheDir)
    } as ICachePluginResult);
}