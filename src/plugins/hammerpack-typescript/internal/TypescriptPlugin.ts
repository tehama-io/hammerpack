import async = require("async");
import * as ts from "typescript";
import _ = require("lodash");
import path = require("path");
import {Task} from "../../../internal/Task";
import {TypescriptCompiler} from "./TypescriptCompiler";
import {EWatchEventType} from "../../../public/plugins/IWatchListener";
import {TypescriptFileCache} from "./TypescriptFileCache";
import {TypescriptCancellationToken} from "./TypescriptCancellationToken";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {ILogger} from "../../../public/api/ILogger";


export function createTypescriptPlugin(params: Task, logger: ILogger): ITaskPluginInstance {
    return new TypescriptPlugin(params, logger);
}

class TypescriptPlugin implements ITaskPluginInstance {
    params: Task;
    logger: ILogger;
    typescriptCompiler: TypescriptCompiler;
    currentlyRunning: boolean = false;
    runAgain: boolean = false;
    ranAtleastOnce: boolean = false;
    watchedPaths: _.Dictionary<boolean>; // initially null intentionally
    addedOrChangedFiles: _.Dictionary<boolean> = {};
    deletedFiles: _.Dictionary<boolean> = {};
    cancellationToken: TypescriptCancellationToken;
    watchReady: boolean;

    constructor(params: Task, logger: ILogger) {
        this.params = params;
        this.logger = logger;
        this.typescriptCompiler =
            new TypescriptCompiler(
                this.params,
                logger,
                TypescriptFileCache.readFile.bind(TypescriptFileCache),
                TypescriptFileCache.writeFile.bind(TypescriptFileCache),
                false // outputClosureCompatible
            );
    }

    develop(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    build(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    test(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    onWatch(eventType: EWatchEventType, fileOrDirPath: string, callback: async.ErrorCallback<Error>): void {
        if (!this.watchReady) {
            if (eventType === EWatchEventType.READY) {
                this.watchReady = true;
            }

            callback(null);
            return;
        }

        const parsedPath: path.ParsedPath = path.parse(fileOrDirPath);

        // whatever has changed surely should not be cached anymore.
        delete TypescriptFileCache.fileCache[fileOrDirPath];

        switch (eventType) {
            case EWatchEventType.ADD_FILE:
            case EWatchEventType.CHANGE:
                // if the file needs to be watched and it is a typescript file then we want to read it
                if ((!this.ranAtleastOnce || this.watchedPaths[fileOrDirPath]) &&
                    (parsedPath.ext === ".ts" || parsedPath.ext === ".tsx" || parsedPath.ext === ".d.ts")) {
                    this.addedOrChangedFiles[fileOrDirPath] = true;
                    TypescriptFileCache.readFile(fileOrDirPath, "utf8");
                }

                break;
            case EWatchEventType.DELETE_FILE:
                this.deletedFiles[fileOrDirPath] = true;
                delete TypescriptFileCache.fileCache[fileOrDirPath];
                break;
            default:
            // do nothing
        }

        // when we are compiling the first time, we don't know what files to watch. However, during this time, a file
        // may change and we may not even pick it up because we are not watching it. Hence, if we haven't finished
        // running atleast once, we watch all files.

        if (!this.ranAtleastOnce || this.watchedPaths[fileOrDirPath]) {
            setTimeout(() => this.compile(), 0);
        }

        callback(null);
    }

    private compile(result?: async.AsyncResultCallback<object, Error>): void {
        if (this.currentlyRunning) {
            this.runAgain = true;
            this.cancellationToken.isCanceled = true;
        } else {
            this.currentlyRunning = true;
            this.runAgain = false;

            const timestamp: number = new Date().getTime();

            const addedOrChangedPaths: string[] = _.keys(this.addedOrChangedFiles);
            const removedPaths: string[] = _.keys(this.deletedFiles);

            this.addedOrChangedFiles = {};
            this.deletedFiles = {};

            this.cancellationToken = new TypescriptCancellationToken();

            this.typescriptCompiler.compile((error: Error, filesToWatch?: string[]) => {
                const newTimestamp: number = new Date().getTime();
                this.logger.info("Compilation completed in " + ((newTimestamp - timestamp) / 1000) + "s.");

                if (error) {
                    this.logger.error(error);
                }

                this.watchedPaths = {};
                if (filesToWatch) {
                    this.ranAtleastOnce = true;
                    filesToWatch.forEach((file: string) => this.watchedPaths[file] = true);
                } else {
                    // we will watch everything using the run atleast once flag if we don't get any files to watch
                    // back.
                    this.ranAtleastOnce = false;
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

            }, this.cancellationToken, addedOrChangedPaths, removedPaths);
        }
    }
}