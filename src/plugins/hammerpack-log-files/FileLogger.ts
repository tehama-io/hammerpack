import {ILogPluginParams} from "../../public/options/logging/ILogPluginParams";
import * as Winston from "winston";
import {ELogLevel} from "../../public/options/logging/ELogLevel";
import * as path from "path";
import {IFileLogOptions} from "./IFileLogOptions";
import {PathUtils} from "../../public/utils/PathUtils";
import _ = require("lodash");
import async = require("async");

const DEFAULT_MAX_FILESIZE: number = 10 * 1024 * 1024;

export function fileLogger(
    params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>): void {

    try {
        const loggers: any[] = [];
        const defaultFilePath: string = path.resolve(
            params.config.jobOutDir, params.config.project.slug +
            ".log");

        const files: Array<IFileLogOptions> = _.isArray(params.options)
            ? params.options as Array<IFileLogOptions> : [params.options as IFileLogOptions];

        _.forEach(files, (opt: IFileLogOptions) => {
            loggers.push(new Winston.transports.File({
                filename: opt.path ? PathUtils.getAsAbsolutePath(opt.path, params.config.workingDir)
                    : defaultFilePath,
                level: opt.level ? opt.level : ELogLevel.info,
                json: opt.format ? opt.format === "json" : true,
                logstash: opt.format ? opt.format === "logstash" : false,
                maxsize: opt.maxsize ? opt.maxsize : DEFAULT_MAX_FILESIZE,
                zippedArchive: opt.zippedArchive ? opt.zippedArchive : false,
                maxFiles: opt.maxFiles ? opt.maxFiles : 1,
                prettyPrint: opt.prettyPrint ? opt.prettyPrint : false,
                label: params.label,
                timestamp: true,
                showLevel: opt.showLevel ? opt.showLevel : true,
            }));
        });

        result(null, loggers);
    } catch (e) {
        result(e);
    }
}