import {ILogPluginParams} from "../../public/options/logging/ILogPluginParams";
import * as Winston from "winston";
import _ = require("lodash");
import async = require("async");
import {IDailyRotateFileLogOptions} from "./IDailyRotateFileLogOptions";
import {PathUtils} from "../../public/utils/PathUtils";
import {ELogLevel} from "../../public/options/logging/ELogLevel";
import * as path from "path";

require("winston-daily-rotate-file");

export function dailyRotateFileLogger(
    params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>): void {

    try {
        const defaultFilePath: string = path.resolve(
            params.config.jobOutDir, params.config.project.slug +
            ".log");

        const dailyRotateFiless: Array<IDailyRotateFileLogOptions> = _.isArray(params.options)
            ? params.options as Array<IDailyRotateFileLogOptions>
            : [params.options as IDailyRotateFileLogOptions];

        result(null, _.map(dailyRotateFiless, (opt: IDailyRotateFileLogOptions) =>
            new (Winston.transports as any).DailyRotateFile({
                filename: opt.path ? PathUtils.getAsAbsolutePath(opt.path, this.workingDir) : defaultFilePath,
                level: opt.level ? opt.level : ELogLevel.info,
                json: opt.format ? opt.format === "json" : true,
                logstash: opt.format ? opt.format === "logstash" : false,
                maxsize: opt.maxsize ? opt.maxsize : 10 * 1024 * 1024,
                zippedArchive: opt.zippedArchive ? opt.zippedArchive : false,
                maxFiles: opt.maxFiles ? opt.maxFiles : 1,
                prettyPrint: opt.prettyPrint ? opt.prettyPrint : false,
                label: params.label,
                timestamp: true,
                showLevel: opt.showLevel ? opt.showLevel : true,
                datePattern: opt.datePattern || "yyyy-MM-dd.",
                prepend: opt.prepend,
                localTime: opt.localTime,
                createTree: opt.createTree,
                maxDays: opt.maxDays
            }))
        );
    } catch (e) {
        result(e);
    }
}