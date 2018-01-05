import {ILogPluginParams} from "../../public/options/logging/ILogPluginParams";
import _ = require("lodash");
import async = require("async");
import {IKafkaLogOptions} from "./IKafkaLogOptions";
import Kafka = require("kafka-logger");

export function kafkaLogger(
    params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>): void {

    try {
        const items: Array<IKafkaLogOptions> = _.isArray(params.options)
            ? params.options as Array<IKafkaLogOptions> : [params.options as IKafkaLogOptions];

        result(null, _.map(items, (opt: IKafkaLogOptions) =>
            new Kafka(_.extend({}, opt, {
                maxRetries: -1,

            })))
        );
    } catch (e) {
        result(e);
    }
}