import async = require("async");
import {ETaskType} from "./ETaskType";
import {ISimpleStore} from "./ISimpleStore";
import {ILogger} from "./ILogger";
import {IConfig} from "./IConfig";

export interface ITask {

    type: ETaskType;

    /**
     * Stores this Task's configuration options.
     */
    options: ISimpleStore;

    /**
     * Stores the Project's environment variables for this task. This can be anything that was loaded with a dotenv
     * file, json or yaml file.
     */
    projectVars: ISimpleStore;

    /**
     * Use this to log all the task's output. Only use this if you don't have the instance of the logger that was
     * supplied to you through the plugin.
     */
    logger: ILogger;

    /**
     * The Hammerpack configuration.
     */
    config: IConfig;

    /**
     * The directory to store all of this task's output.
     */
    taskOutDir: string;

    /**
     * The map of source file names to destination file names. See `addSourceToDestFileMapping(..)`.
     */
    destPaths: _.Dictionary<string>;

    /**
     * Sets the destination file path for the given source file path.
     *
     * There are two uses of this method:
     * 1. Use this if getDestPath(..) does not return the correct path that you want (including file extension).
     * 2. You want other plugins to see this mapping.
     *
     * This function just adds an entry to `destPaths`.
     *
     * @param {string} sourceFilePath
     * @param {string} targetFilePath
     */
    addSourceToDestFileMapping(sourceFilePath: string, targetFilePath: string): void;

    /**
     * Gets the destination path for the given filepath. The filepath can be relative to the root-directory.
     *
     * @param {string} filepath
     * @returns {string}
     */
    getDestPath(filepath: string): string;

    /**
     * Copies a file from the source to the target.
     *
     * @param {string} source
     * @param {string} target
     * @param {ErrorCallback<Error>} cb
     */
    copyFile(source: string, target: string, cb: async.ErrorCallback<Error>, substitutions?: _.Dictionary<string>): void;

    /**
     * Copies the source directory recursively into the target directory.
     *
     * @param {string} source
     * @param {string} target
     * @param {ErrorCallback<Error>} cb
     * @param substitutions A dictionary of RegExp (what to replace) vs string (what to replace with)
     */
    copyDir(source: string, target: string, cb: async.ErrorCallback<Error>, substitutions?: _.Dictionary<string>): void;

    /**
     * Reloads the environment variables that are specified in the task env-var-files parameter.
     *
     * @param {ErrorCallback<Error>} callback
     */
    reloadEnvVars(callback: async.ErrorCallback<Error>): void;
}