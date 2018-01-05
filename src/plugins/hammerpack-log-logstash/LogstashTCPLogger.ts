import {ILogPluginParams} from "../../public/options/logging/ILogPluginParams";
import * as Winston from "winston";
import _ = require("lodash");
import async = require("async");
import {ILogstashTCPLogOptions} from "./ILogstashTCPLogOptions";
require("winston-logstash");

export function logstashTCPLogger(
    params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>): void {

    try {
        const items: Array<ILogstashTCPLogOptions> = _.isArray(params.options)
            ? params.options as Array<ILogstashTCPLogOptions> : [params.options as ILogstashTCPLogOptions];

        result(null, _.map(items, (opt: ILogstashTCPLogOptions) =>
            new (Winston.transports as any).Logstash(_.extend({}, opt, {
                max_connect_retries: -1,
            })))
        );
    } catch (e) {
        result(e);
    }
}