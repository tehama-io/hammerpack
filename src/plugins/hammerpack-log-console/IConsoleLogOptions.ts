import {ICommonLogOptions} from "../../public/options/logging/ICommonLogOptions";

/**
 * Console output options.
 */
export interface IConsoleLogOptions extends ICommonLogOptions {

    /**
     * Whether to colorize the logs.
     *
     * Default: true
     */
    colorize?: boolean;
}