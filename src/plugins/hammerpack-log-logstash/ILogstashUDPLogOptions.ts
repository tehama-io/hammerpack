import {ELogLevel} from "../../public/options/logging/ELogLevel";

export interface ILogstashUDPLogOptions {

    /**
     * The level of logging that will be output.
     *
     * Values: error|warn|info|verbose|debug|silly
     * Default: info
     */
    level?: ELogLevel;

    /**
     * The logstash host.
     *
     * Default: 127.0.0.1
     */
    host?: string;

    /**
     * The logstash port.
     *
     * Default: 28777
     */
    port?: number;

    /**
     * The name of this node. You may want to customize this to be the node IP instead.
     *
     * Default: ${project:name}.
     */
    application?: string;

    /**
     * The pid you want to log all messages with.
     *
     * Default: process.pid
     */
    pid?: string;
}