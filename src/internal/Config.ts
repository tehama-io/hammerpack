import _ = require("lodash");
import async = require("async");
import mkdirp = require("mkdirp");
import fs = require("fs");
import chokidar = require("chokidar");
import * as path from "path";
import {PluginManager} from "./PluginManager";
import {Job} from "./Job";
import {Repo} from "./Repo";
import {SimpleStore} from "./SimpleStore";
import {Project} from "./Project";
import {resolveConfigVars} from "./ConfigResolver";
import {IConfig} from "../public/api/IConfig";
import {Cache} from "./Cache";
import {Plugins} from "./Plugins";
import {ICachePlugin, ICachePluginResult} from "../public/plugins/ICachePlugin";
import {ICachePluginParams} from "../public/options/ICachePluginParams";
import {EWatchEventType} from "../public/plugins/IWatchListener";
import {ErrorUtil} from "../public/utils/ErrorUtil";
import {Task} from "./Task";
import {AutoRunner} from "./AutoRunner";
import {ITaskPluginInstance} from "../public/plugins/ITaskPlugin";

export class Config implements IConfig {
    static HAMMERPACK_REPO_FOLDER: string = ".hammerpack";
    static LOGS_FOLDER: string = ".logs";
    /**
     * Stores the Hammerpack configuration.
     */
    options: SimpleStore;

    /**
     * This is the directory which we resolve all other relative directories with.
     */
    workingDir: string;

    /**
     * This is the directory that stores all of hammerpack job output.
     */
    hammerpackDir: string;

    /**
     * This is the directory where we output all of this job's results.
     */
    jobOutDir: string;

    /**
     * Where all the logs are stored.
     */
    logsFolder: string;

    /**
     * Information about the project's containing repo.
     */
    repo: Repo;

    /**
     * Information about the job.
     */
    job: Job;

    /**
     * Information about the project.
     */
    project: Project;

    /**
     * Key-value cache to store all sorts of information for your task.
     */
    cache: Cache;

    /**
     * The configuration file that was used to load this config. May be null if the config was loaded programmatically.
     */
    confFilePath: string;

    constructor(namespace: string, workingDir: string) {
        this.options = new SimpleStore(namespace);
        this.workingDir = workingDir;
    }

    build(callback: async.ErrorCallback<Error>): void {
        async.series([
            this.resolveVars.bind(this),
            this.initializePaths.bind(this),
            this.requirePlugins.bind(this),
            this.buildCache.bind(this),
            this.buildJob.bind(this),
            this.watch.bind(this)
        ], callback);
    }

    execute(callback: async.ErrorCallback<Error>): void {
        this.job.execute(callback);
    }

    private resolveVars(callback: async.ErrorCallback<Error>): void {
        resolveConfigVars(
            this.options,
            [
                "system",
                "repo",
                "project",
                "job",
                "develop",
                "build",
                "run",
                "test",
                "deploy"
            ],
            callback
        );
    }

    private initializePaths(callback: async.ErrorCallback<Error>): void {
        this.repo = new Repo(this.options, this.workingDir);
        this.job = new Job(this);
        this.project = new Project(this.options, this.workingDir);

        this.hammerpackDir = path.resolve(this.repo.rootDirectoryPath, Config.HAMMERPACK_REPO_FOLDER);
        this.jobOutDir = path.resolve(this.hammerpackDir, this.project.slug, this.job.id);
        this.logsFolder = path.resolve(this.jobOutDir, Config.LOGS_FOLDER);

        mkdirp(this.logsFolder, (err) => {
            callback(err);
        });
    }

    private requirePlugins(callback: async.ErrorCallback<Error>): void {
        const plugins: Array<string> = this.options.getAsArray("plugins");

        let callbackCalled: boolean = false;

        _.forEach(plugins, (pluginName: string) => {
            if (PluginManager.pluginModules[pluginName]) {
                // already loaded, don't do anything
                return true;
            }

            try {
                const pluginModule: any = require(pluginName);
                if (!pluginModule) {
                    callback(new Error("Cannot find plugin " + pluginName +
                        ". Are you sure you have added it to the package.json file?"));
                    callbackCalled = true;
                    return false;
                }

                if (_.isFunction(pluginModule)) {
                    // tslint:disable-next-line
                    (pluginModule as Function)(PluginManager.plugins);
                } else if (_.isFunction(pluginModule.default)) {
                    // tslint:disable-next-line
                    (pluginModule.default as Function)(PluginManager.plugins);
                } else if (_.isFunction(pluginModule.main)) {
                    // tslint:disable-next-line
                    (pluginModule.main as Function)(PluginManager.plugins);
                } else {
                    callback(new Error("Can't figure out how to load plugin " + pluginName +
                        ". The plugin should export a default function that accepts a dictionary of string (config path) vs " +
                        "the plugin function. See documentation for more details."));
                    callbackCalled = true;
                    return false;
                }

                return true;
            } catch (e) {
                callback(e);
                callbackCalled = true;
                return false;
            }
        });

        if (!callbackCalled) {
            callback(null);
        }
    }

    private buildCache(callback: async.ErrorCallback<Error>): void {
        const cache: object = this.options.get("system:cache") || "rocksdb"; // rocksdb is the default cache provider.
        if (cache) {
            if (_.isString(cache)) {
                const plugin: ICachePlugin = Plugins["system:cache:" + cache] as ICachePlugin;
                if (plugin) {
                    plugin({
                        config: this,
                        options: {}
                    } as ICachePluginParams, (err: Error, leveldown: ICachePluginResult) => {
                        this.cache = new Cache(leveldown);
                        callback(err);
                    });

                    return;
                }
            } else if (_.size(cache) > 0) {
                // go through each item in the cache until we find a plugin we can use.
                let found: boolean = false;
                _.forEach(cache, (value: any, key: string) => {
                    const plugin: ICachePlugin = Plugins["system:cache:" + key] as ICachePlugin;
                    if (plugin) {
                        found = true;
                        plugin({
                            config: this,
                            options: value
                        } as ICachePluginParams, (err: Error, leveldown: ICachePluginResult) => {
                            this.cache = new Cache(leveldown);
                            callback(err);
                        });

                        return true;
                    } else {
                        return false;
                    }
                });

                if (found) {
                    return;
                }
            }
        }

        this.cache = new Cache();
        callback(null);
    }

    private buildJob(callback: async.ErrorCallback<Error>): void {
        this.job.build(callback);
    }

    private watch(callback: async.ErrorCallback<Error>): void {
        // let's first read any gitignore files that we may have
        const ignores: _.Dictionary<true> = {
            [path.resolve(this.repo.rootDirectoryPath, Config.HAMMERPACK_REPO_FOLDER, "**")]: true,
            [path.resolve(this.repo.rootDirectoryPath, "**", ".git", "**")]: true
        };

        this.getIgnores(path.resolve(this.workingDir, ".gitignore"), ignores);
        this.getIgnores(path.resolve(this.repo.rootDirectoryPath, ".gitignore"), ignores);

        chokidar
            .watch(this.repo.rootDirectoryPath, {
                ignored: _.keys(ignores),
                ignoreInitial: false
            })
            .on("add", (path: string) =>
                this.fireWatchListeners(EWatchEventType.ADD_FILE, path)
            )
            .on("addDir", (path: string) =>
                this.fireWatchListeners(EWatchEventType.ADD_DIR, path)
            )
            .on("change", (path: string) =>
                this.fireWatchListeners(EWatchEventType.CHANGE, path)
            )
            .on("unlink", (path: string) =>
                this.fireWatchListeners(EWatchEventType.DELETE_FILE, path)
            )
            .on("unlinkDir", (path: string) =>
                this.fireWatchListeners(EWatchEventType.DELETE_DIR, path)
            )
            .on("ready", (path: string) =>
                this.fireWatchListeners(EWatchEventType.READY, this.repo.rootDirectoryPath)
            )
        ;

        callback();
    }

    private getIgnores(filename: string, ignoresDict: _.Dictionary<true>): void {
        if (fs.existsSync(filename)) {
            const filenameDir: string = path.parse(filename).dir;
            const ignores: string = fs.readFileSync(filename, "utf8").toString();
            ignores.split("\n").forEach((ignore) => {
                const ignoreStr: string = _.trim(ignore, "\n\r\t ");
                if (ignoreStr && !ignoreStr.startsWith("#")) {
                    const parsedPath: path.ParsedPath = path.parse(path.resolve(filenameDir, "**", ignoreStr));
                    if (!parsedPath.ext) {
                        ignoresDict[path.resolve(filenameDir, "**", ignoreStr, "**")] = true;
                    } else {
                        ignoresDict[path.resolve(filenameDir, "**", ignoreStr)] = true;
                    }
                }
            });
        }
    }

    private fireWatchListeners(eventType: EWatchEventType, path: string): void {
        // watch listeners are only fired for the Develop task.
        // we will fire watch listeners in the same order that was defined for the task's "do" parameter.
        _.forEach(this.job.tasks, (task: Task) => {
            if (_.keys(task.pluginInstances).length > 0) {
                const autoRunner: AutoRunner = new AutoRunner("fireWatchListeners for " + task.type);
                _.forEach(task.pluginInstances, (value: ITaskPluginInstance, key: string) => {
                    autoRunner.add(key, (callback: (error?: Error, result?: any) => void): void => {
                        if (value.onWatch) {
                            value.onWatch(eventType, path, callback);
                        } else {
                            callback();
                        }
                    });
                });

                autoRunner.parse(task.options.get("do")).run((error: Error) => {
                    if (error) {
                        task.logger.error(
                            ErrorUtil.customize(error, "An error occurred while firing onWatch listener for task " +
                                task.type));
                    }
                });
            }
        });
    }
}