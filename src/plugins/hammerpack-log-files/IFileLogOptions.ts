import {ICommonLogOptions} from "../../public/options/logging/ICommonLogOptions";

/**
 * File output options
 */
export interface IFileLogOptions extends ICommonLogOptions {
    /**
     * A string representing the path of the directory to save the logs to.
     *
     * Default: ${repo:root-directory}/.hammerpack/${job:name}/${job:type}/.logs/${job:id}
     */
    path?: string;

    /**
     * The maximum size of the file, in bytes.
     *
     * Default: 10mb
     */
    maxsize?: number;

    /**
     * The maximum number of files before rotation occurs.
     *
     * See https://github.com/winstonjs/winston/issues/366
     *
     * Default: 1
     */
    maxFiles?: number;

    /**
     * Whether the log files are in zipped format.
     *
     * Default: false
     */
    zippedArchive?: boolean;
}