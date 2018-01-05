import async = require("async");
import {ITask} from "../api/ITask";
import {IWatchListener} from "./IWatchListener";
import {ILogger} from "../api/ILogger";

export interface ITaskPluginInstance {
    /**
     * Called for the develop ETaskType.
     *
     * @param {AsyncResultCallback<Object, Error>} callback
     */
    develop?: (callback: async.AsyncResultCallback<object, Error>) => void;

    /**
     * Called for the test ETaskType.
     *
     * @param {AsyncResultCallback<Object, Error>} callback
     */
    test?: (callback: async.AsyncResultCallback<object, Error>) => void;

    /**
     * Called for the build ETaskType.
     *
     * @param {AsyncResultCallback<Object, Error>} callback
     */
    build?: (callback: async.AsyncResultCallback<object, Error>) => void;

    /**
     * Called for the deploy ETaskType.
     *
     * @param {AsyncResultCallback<Object, Error>} callback
     */
    deploy?: (callback: async.AsyncResultCallback<object, Error>) => void;

    /**
     * Called for the run ETaskType.
     *
     * @param {AsyncResultCallback<Object, Error>} callback
     */
    run?: (callback: async.AsyncResultCallback<object, Error>) => void;

    /**
     * Will be called whenever files are changed in the repo. You can ignore these or act upon them as you wish.
     */
    onWatch?: IWatchListener;
}

/**
 * Each Task plugin needs to implement this to create a plugin instance.
 */
export type ITaskPlugin = (params: ITask, logger: ILogger) => ITaskPluginInstance;