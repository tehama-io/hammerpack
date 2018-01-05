import {IFileLogOptions} from "./IFileLogOptions";

export interface IDailyRotateFileLogOptions extends IFileLogOptions {
    /**
     * A string representing the pattern to be used when appending the date to the filename (default 'yyyy-MM-dd'). The
     * meta characters used in this string will dictate the frequency of the file rotation. For example, if your
     * datePattern is simply 'HH' you will end up with 24 log files that are picked up and appended to every day.
     *
     * Default: "yyyy-MM-dd."
     */
    datePattern: string;

    /**
     * A number representing the maximum number of days a log file will be saved. Any log file older than this
     * specified number of days will be removed. If not value or a 0, no log files will be removed.
     *
     * Default: 0
     */
    maxDays: number;

    /**
     * Defines if the rolling time of the log file should be prepended at the beginning of the filename.
     *
     * Default: false
     */
    prepend: boolean;

    /**
     * A boolean to define whether time stamps should be local (default 'false' means that UTC time will be used).
     */
    localTime: boolean;

    /**
     * When combined with a datePattern that includes path delimiters, the transport will create the entire folder tree
     * to the log file. Example: datePattern: '/yyyy/MM/dd.log', createTree: true will create the entire path to the
     * log file prior to writing an entry.
     *
     * Default: false
     */
    createTree?: boolean;
}