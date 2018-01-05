import {ILogPluginParams} from "../../public/options/logging/ILogPluginParams";
import * as Winston from "winston";
import {ELogLevel} from "../../public/options/logging/ELogLevel";
import async = require("async");
import {IConsoleLogOptions} from "./IConsoleLogOptions";
import {ELogOutputFormat} from "../../public/options/logging/ELogOutputFormat";
import _ = require("lodash");

export function consoleLogger(
    params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>): void {

    try {
        const items: Array<IConsoleLogOptions> = _.isArray(params.options)
            ? params.options as Array<IConsoleLogOptions> : [params.options as IConsoleLogOptions];

        result(null, _.map(items, (opt: IConsoleLogOptions) =>
            new Winston.transports.Console({
                colorize: opt.colorize === undefined ? true : opt.colorize,
                level: opt.level || ELogLevel.info,
                json: opt.format === undefined ? false : opt.format === ELogOutputFormat.json,
                logstash: opt.format === undefined ? false : opt.format === ELogOutputFormat.logstash,
                prettyPrint: opt.prettyPrint === undefined ? false : opt.prettyPrint,
                showLevel: opt.showLevel === undefined ? true : opt.showLevel,
                label: params.label,
                timestamp: opt.timestamp === undefined ? true : opt.timestamp
            }))
        );
    } catch (e) {
        result(e);
    }
}