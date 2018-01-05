import async = require("async");
import _ = require("lodash");
import path = require("path");
import {Task} from "../../../internal/Task";
import {EWatchEventType} from "../../../public/plugins/IWatchListener";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {ILogger} from "../../../public/api/ILogger";
import {ErrorUtil} from "../../../public/utils/ErrorUtil";
import {PathUtils} from "../../../public/utils/PathUtils";
import * as fs from "fs";
import anymatch = require("anymatch");

export function createCopyAssetsPlugin(params: Task, logger: ILogger): ITaskPluginInstance {
    return new CopyAssetsPlugin(params, logger);
}

/**
 * Copies assets from the given source directories to the hammerpack staging area so that other plugins can use
 * these files to compile code.
 */
class CopyAssetsPlugin implements ITaskPluginInstance {
    params: Task;
    logger: ILogger;
    currentlyRunning: boolean = false;
    runAgain: boolean = false;
    addedOrChangedFiles: _.Dictionary<boolean> = {};
    deletedFiles: _.Dictionary<boolean> = {};
    rootDir: string;
    copyDirs: string[];
    copyFilenames: (string | RegExp)[];
    ignoreDirs: string[];
    ignoreFilenames: string[];

    constructor(params: Task, logger: ILogger) {
        this.params = params;
        this.logger = logger;

        this.rootDir = this.params.config.repo.rootSrcDirectoryPath;

        if (this.params.options.exists("copyassets:dirs")) {
            this.copyDirs = this.params.options.getAsArray("copyassets:dirs");
            for (let i: number = 0; i < this.copyDirs.length; i++) {
                this.copyDirs[i] = PathUtils.getAsAbsolutePath(this.copyDirs[i], this.params.config.workingDir);
            }
        } else {
            this.copyDirs = [path.resolve(this.params.config.workingDir, "**")];
        }

        this.ignoreDirs = this.params.options.getAsArray("copyassets:ignoreDirs");
        for (let i: number = 0; i < this.ignoreDirs.length; i++) {
            this.ignoreDirs[i] = PathUtils.getAsAbsolutePath(this.ignoreDirs[i], this.params.config.workingDir);
        }

        if (this.params.options.exists("copyassets:filenames")) {
            this.copyFilenames = this.params.options.getAsArray("copyassets:filenames");
        } else {
            this.copyFilenames = DEFAULT_PATHS_TO_MATCH;
        }

        this.ignoreFilenames = this.params.options.getAsArray("copyassets:ignoreFilenames");
    }

    develop(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    build(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    onWatch(eventType: EWatchEventType, fileOrDirPath: string, callback: async.ErrorCallback<Error>): void {
        let didSomething: boolean = false;
        switch (eventType) {
            case EWatchEventType.ADD_FILE:
            case EWatchEventType.CHANGE:
                if (this.canHandleFile(fileOrDirPath)) {
                    this.addedOrChangedFiles[fileOrDirPath] = true;
                    didSomething = true;
                }
                break;
            case EWatchEventType.DELETE_FILE:
                if (this.canHandleFile(fileOrDirPath)) {
                    this.deletedFiles[fileOrDirPath] = true;
                    didSomething = true;
                }
                break;
            default:
            // do nothing
        }

        // when we are compiling the first time, we don't know what files to watch. However, during this time, a file
        // may change and we may not even pick it up because we are not watching it. Hence, if we haven't finished
        // running atleast once, we watch all files.

        if (didSomething) {
            setTimeout(() => this.compile(), 0);
        }

        callback(null);
    }

    private compile(result?: async.AsyncResultCallback<object, Error>): void {
        if (this.currentlyRunning) {
            this.runAgain = true;
        } else {
            this.currentlyRunning = true;
            this.runAgain = false;

            const timestamp: number = new Date().getTime();

            const addedOrChangedPaths: string[] = _.keys(this.addedOrChangedFiles);
            const removedPaths: string[] = _.keys(this.deletedFiles);
            this.addedOrChangedFiles = {};
            this.deletedFiles = {};

            const fns: async.AsyncVoidFunction<Error>[] = [];

            // first go through all the files that have been added or changed and copy them.
            _.forEach(addedOrChangedPaths, (filename: string) => {
                fns.push((callback: async.ErrorCallback<Error>) => {
                    const destPath: string = this.params.getDestPath(filename);
                    this.params.addSourceToDestFileMapping(filename, destPath);
                    this.params.copyFile(filename, destPath, callback);
                });
            });

            // now go through all the deleted files and delete them.
            _.forEach(removedPaths, (filename: string) => {
                fns.push((callback: async.ErrorCallback<Error>) => {
                    const destPath: string = this.params.getDestPath(filename);
                    if (fs.existsSync(destPath)) {
                        fs.unlink(destPath, callback);
                    } else {
                        callback();
                    }
                });
            });

            // finally, run it all in parallel
            async.parallel(fns, (error: Error) => {
                if (error) {
                    this.logger.error(ErrorUtil.customize(error, "An error occurred while trying to copy assets."));
                } else {
                    const newTimestamp: number = new Date().getTime();

                    if (addedOrChangedPaths.length > 0 || removedPaths.length > 0) {
                        this.logger.info(
                            `Copied ${addedOrChangedPaths.length} files and removed ${removedPaths.length} files in ${((newTimestamp -
                                timestamp) / 1000)} s.`);
                    }
                }

                if (this.runAgain) {
                    setTimeout(() => {
                        this.currentlyRunning = false;
                        this.compile(result);
                    }, 0);
                } else {
                    this.currentlyRunning = false;

                    if (result) {
                        result(error);
                    }
                }
            });
        }
    }

    private canHandleFile(filename: string): boolean {
        const parsedPath: path.ParsedPath = path.parse(filename);
        if (anymatch(this.copyDirs, parsedPath.dir + path.sep)) {
            if (this.ignoreDirs && this.ignoreDirs.length > 0 && anymatch(this.ignoreDirs, parsedPath.dir + path.sep)) {
                return false;
            } else {
                // check the extension
                if (anymatch(this.copyFilenames, parsedPath.base)) {
                    if (this.ignoreFilenames && this.ignoreFilenames.length > 0 &&
                        anymatch(this.ignoreFilenames, parsedPath.base)) {
                        return false;
                    } else {
                        return true;
                    }
                } else {
                    return false;
                }
            }
        } else {
            return false;
        }
    }
}

const DEFAULT_PATHS_TO_MATCH: (RegExp | string)[] = [
    /\.(js|css|less|sass|scss|jp[e]?g|png|gif|svg|ico|htm|html|woff|woff2|eot|ttf|env|config|json|yaml|txt|md|csv|pdf|doc|xls)$/
];