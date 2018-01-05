
/**
 * What, how and where to log output for jobs.
 */
export interface ILogOptions {

    /**
     * Options of the plugin that you want to use for logging.
     */
    [pluginName: string]: object|Array<object>;
}
