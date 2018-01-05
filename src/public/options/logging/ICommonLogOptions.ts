import {ELogLevel} from "./ELogLevel";
import {ELogOutputFormat} from "./ELogOutputFormat";

export interface ICommonLogOptions {
    /**
     * Should pretty print the JSON output?
     *
     * Default: true
     */
    prettyPrint?: boolean;

    /**
     * Should show timestamp?
     *
     * Default: true
     */
    timestamp?: boolean;

    /**
     * Should show the level of the log in the output?
     *
     * Default: true
     */
    showLevel?: boolean;

    /**
     * The level of logging that will be output.
     *
     * Values: error|warn|info|verbose|debug|silly
     * Default: info
     */
    level?: ELogLevel;

    /**
     * What format should the logs be output in?
     *
     * Values: simple, json, logstash
     * Default: json
     */
    format?: ELogOutputFormat;
}