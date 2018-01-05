import {IEnvVarConfig} from "./IEnvVarConfig";
import {ILogOptions} from "./logging/ILogOptions";

/**
 * The base interface for all job configurations.
 */
export interface IBaseJobOptions {

    /**
     * The plugin or list of plugins that you want to execute.
     */
    do: string|Array<string>;

    /**
     * Specifies the paths of the files that contain settings that the application needs.
     */
    "env-var-files"?: IEnvVarConfig;

    /**
     * Where to log progress and result.
     */
    log?: ILogOptions;
}