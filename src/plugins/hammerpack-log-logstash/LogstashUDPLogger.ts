import {ILogPluginParams} from "../../public/options/logging/ILogPluginParams";
import _ = require("lodash");
import async = require("async");
import {ILogstashUDPLogOptions} from "./ILogstashUDPLogOptions";
import LogstashUDP = require("winston-logstash-udp");
const logstashUDPTransport = LogstashUDP;

export function logstashUDPLogger(
    params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>): void {

    try {
        const logstashes: Array<ILogstashUDPLogOptions> = _.isArray(params.options)
            ? params.options as Array<ILogstashUDPLogOptions> : [params.options as ILogstashUDPLogOptions];

        result(null, _.map(logstashes, (opt: ILogstashUDPLogOptions) =>
            new logstashUDPTransport(opt))
        );
    } catch (e) {
        result(e);
    }
}