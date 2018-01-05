import _ = require("lodash");
import * as Winston from "winston";
import dotenv = require("dotenv");
import fs = require("fs");
import yaml = require("js-yaml");
import mkdirp = require("mkdirp");
import async = require("async");
import {ELogLevel} from "../public/options/logging/ELogLevel";
import {IEnvVarConfig} from "../public/options/IEnvVarConfig";
import {PathUtils} from "../public/utils/PathUtils";
import {ErrorUtil} from "../public/utils/ErrorUtil";
import {ETaskType} from "../public/api/ETaskType";
import {SimpleStore} from "./SimpleStore";
import {ILogger} from "../public/api/ILogger";
import {ILogOptions} from "../public/options/logging/ILogOptions";
import {Plugins} from "./Plugins";
import {ILogPluginParams} from "../public/options/logging/ILogPluginParams";
import {Config} from "./Config";
import {PluginManager} from "./PluginManager";
import {IPluginJobResult} from "../public/plugins/IPluginJobResult";
import * as path from "path";
import {ITask} from "../public/api/ITask";
import {ITaskPlugin, ITaskPluginInstance} from "../public/plugins/ITaskPlugin";
import {ILogPlugin} from "../public/plugins/ILogPlugin";
import {AutoRunner} from "./AutoRunner";

/**
 * A Task of a job can be develop, test, build, run, or deploy.
 */
export class Task implements ITask {
    type: ETaskType;

    /**
     * Stores this Task's configuration options.
     */
    options: SimpleStore;

    /**
     * Stores the Project's environment variables for this task. This can be anything that was loaded with a dotenv
     * file, json or yaml file.
     */
    projectVars: SimpleStore;

    /**
     * Use this to log all the task's output.
     */
    logger: ILogger;

    /**
     * The Hammerpack configuration.
     */
    config: Config;

    /**
     * The directory to store all of this task's output.
     */
    taskOutDir: string;

    /**
     * The plugin instances of this task.
     *
     * @type {{}}
     */
    pluginInstances: _.Dictionary<ITaskPluginInstance> = {};

    /**
     * Source path vs destination path.
     *
     * @type {{}}
     */
    destPaths: _.Dictionary<string> = {};

    private loggers: any[] = [];

    constructor(type: ETaskType, config: Config) {
        this.type = type;
        this.config = config;

        // this would give us an nconf for Hammerpack configuration relating to this task.
        this.options = new SimpleStore(this.config.options.namespace + ":" + this.type);
    }

    build(callback: async.ErrorCallback<Error>): void {
        async.series([
            this.createLoggers.bind(this),
            this.createLogger.bind(this),
            this.reloadEnvVars.bind(this),
            this.initializePaths.bind(this)
        ], callback);
    }

    execute(callback: async.AsyncResultCallback<_.Dictionary<IPluginJobResult>, Error>): void {
        const results: _.Dictionary<IPluginJobResult> = {};

        callback = _.once(callback);

        const taskName: string = this.config.project.slug + "/" + this.config.job.id + "/" + this.type;

        const runner: AutoRunner = new AutoRunner(taskName);

        const pluginsToExecuteDict: object = {};
        const pluginConfig: string|string[] = this.options.get("do");
        runner.doParse(pluginConfig, pluginsToExecuteDict, true);
        const pluginsToExecute: string[] = _.keys(pluginsToExecuteDict);

        if (pluginsToExecute.length === 0) {
            callback(new Error("There are no tasks to execute for " + this.type));
            return;
        }

        _.forEach(pluginsToExecute, (pluginName: string) => {
            if (BLACKLISTED_PLUGINS_KEYS[pluginName]) {
                return true;
            }

            const plugin: ITaskPlugin = PluginManager.plugins[pluginName] as any;
            if (plugin) {
                const loggingLabel: string = pluginName + "::" + taskName;
                const loggers: any[] = [];

                this.createNamedLoggers((namedLoggersError: Error) => {
                    if (namedLoggersError) {
                        callback(ErrorUtil.customize(
                            namedLoggersError, "An error occured while creating a logger for plugin " +
                            pluginName));
                        return;
                    }

                    const logger: ILogger = this.createFromLoggers(loggers);

                    this.pluginInstances[pluginName] = plugin(this, logger);

                    if (!this.pluginInstances[pluginName]) {
                        callback(new Error("The plugin " + pluginName + " did not return an instance."));
                        return;
                    }

                    runner.add(pluginName, (innerCallback: (err?: Error, result?: any) => void): void => {
                        const fnName: string = this.type as string;
                        this.pluginInstances[pluginName][fnName]((pluginError: Error, pluginResult: object): void => {
                            results[pluginName] = {
                                error: pluginError,
                                result: pluginResult
                            };

                            if (pluginError) {
                                innerCallback(pluginError);
                            } else {
                                innerCallback(null);
                            }
                        });
                    });

                }, loggingLabel, loggers);
            }

            return true;
        });

        runner.parse(pluginConfig).run((error: Error) => callback(error, results));
    }

    addSourceToDestFileMapping(sourceFilePath: string, targetFilePath: string): void {
        this.destPaths[sourceFilePath] = targetFilePath;
    }

    getDestPath(filepath: string): string {
        let destPath: string = this.destPaths[filepath];
        if (destPath) {
            return destPath;
        }

        const filename: string = PathUtils.getAsAbsolutePath(filepath, this.config.repo.rootDirectoryPath);
        const relativeTo: string = this.config.repo.rootSrcDirectoryPath ||
            this.config.repo.rootDirectoryPath;

        if (!filename.startsWith(relativeTo + path.sep)) {
            return filename;
        }

        destPath = path.resolve(PathUtils.getAsAbsolutePath(
            path.relative(relativeTo, filename), this.taskOutDir));

        mkdirp.sync(path.parse(destPath).dir);

        const parsedPath: path.ParsedPath = path.parse(destPath);

        // TODO: we probably need to have some plugin extensibility here that allows us to translate a source file
        // TODO: to a destination file extension. For now this will do, especially since we also have
        // TODO: `#addSourceToDestFileMapping(..)`
        if (parsedPath.ext === ".ts" || parsedPath.ext === ".tsx") {
            parsedPath.ext = ".js";
            parsedPath.base = parsedPath.base.replace(".tsx", ".js").replace(".ts", ".js");
            destPath = path.format(parsedPath);
        }

        return destPath;
    }

    copyFile(
        source: string, target: string, cb: async.ErrorCallback<Error>, substitutions?: _.Dictionary<string>): void {
        if (substitutions) {
            // treat it as a UTF8 file that we can do substitutions on...
            try {
                let fileContents: string = fs.readFileSync(source, "utf8").toString();
                _.forEach(substitutions, (value: string, key: string) => {
                    const regExp = new RegExp(key, "g");
                    fileContents = fileContents.replace(regExp, value);
                });

                fileContents = this.unescapeSpecialJsonCharacters(fileContents);

                fs.writeFile(target, fileContents, {encoding: "utf8"}, cb);
            } catch (e) {
                cb(e);
            }
        } else {
            cb = _.once(cb);

            const rd: fs.ReadStream = fs.createReadStream(source);
            rd.on("error", function (err) {
                cb(err);
            });
            const wr: fs.WriteStream = fs.createWriteStream(target);
            wr.on("error", function (err) {
                cb(err);
            });
            wr.on("close", function (ex) {
                cb();
            });

            rd.pipe(wr);
        }
    }

    copyDir(source: string, target: string, cb: async.ErrorCallback<Error>, substitutions?: _.Dictionary<string>): void {
        if (!fs.statSync(source).isDirectory()) {
            throw new Error("Source is not a directory.");
        }
        if (!fs.statSync(target).isDirectory()) {
            throw new Error("Target is not a directory.");
        }

        const parsedPath: path.ParsedPath = path.parse(source);
        const toProcess: string[] = [parsedPath.base];
        const fns: async.AsyncVoidFunction<Error>[] = [];
        let index: number = 0;

        while (index < toProcess.length) {
            const fileOrDir: string = toProcess[index];
            const fileOrDirFull: string = path.resolve(parsedPath.dir, fileOrDir);
            if (fs.statSync(fileOrDirFull).isDirectory()) {
                mkdirp.sync(path.resolve(target, fileOrDir));

                // go through all the contents of this directory and add to the toProcess
                const children: string[] = fs.readdirSync(fileOrDirFull);
                if (children && children.length > 0) {
                    _.forEach(children, (child: string) => toProcess.push(fileOrDir + path.sep + child));
                }
            } else {
                fns.push((innerCallback: (err: Error) => void) =>
                    this.copyFile(fileOrDirFull, path.resolve(target, fileOrDir), innerCallback, substitutions)
                );
            }
            index++;
        }

        async.parallel(fns, cb);
    }

    reloadEnvVars(callback: async.ErrorCallback<Error>): void {
        // this would give us a brand new nconf to store this task's project settings.
        this.projectVars = new SimpleStore(this.options.namespace + "-" + Math.random() + "-" + this.type);

        const envVarConf: IEnvVarConfig = this.options.get("env-var-files");

        if (!envVarConf) {
            callback(null);
            return;
        }

        let callbackCalled: boolean = false;

        if (envVarConf.dotenv) {
            let dotenvFiles: string[] = envVarConf.dotenv as Array<string>;
            if (!_.isArray(envVarConf.dotenv)) {
                dotenvFiles = [envVarConf.dotenv as string];
            }

            _.forEach(dotenvFiles, (filename: string) => {
                const fullpath: string = PathUtils.getAsAbsolutePath(filename, this.config.workingDir);
                try {
                    // maybe in the future allow reading different encodings?
                    const envvars: { [name: string]: string } = dotenv.parse(fs.readFileSync(fullpath, "utf8"));
                    if (envvars) {
                        _.forEach(envvars, (value: string, key: string) => {
                            this.projectVars.set(key, value);
                        });
                    }

                    return true;
                } catch (e) {
                    callback(ErrorUtil.customize(
                        e, "There was a problem in loading the project environment variables from " +
                        this.type + "env-var-files:dotenv. The file " + fullpath + " failed to load. Error below."));
                    callbackCalled = true;
                    return false;
                }
            });
        }

        if (callbackCalled) {
            return;
        }

        if (envVarConf["nconf-json"]) {
            let files: string[] = envVarConf["nconf-json"] as Array<string>;
            if (!_.isArray(envVarConf["nconf-json"])) {
                files = [envVarConf["nconf-json"] as string];
            }

            _.forEach(files, (filename: string) => {
                const fullpath: string = PathUtils.getAsAbsolutePath(filename, this.config.workingDir);
                try {
                    // maybe in the future allow reading different encodings?
                    const envvars: object = JSON.parse(
                        fs.readFileSync(fullpath, "utf8").toString());

                    if (envvars) {
                        _.forEach(envvars, (value: object, key: string) => {
                            this.projectVars.set(key, value);
                        });
                    }

                    return true;
                } catch (e) {
                    callback(ErrorUtil.customize(
                        e, "There was a problem in loading the project environment variables from " +
                        this.type + "env-var-files:nconf-json. The file " + fullpath + " failed to load. Error below."));
                    callbackCalled = true;
                    return false;
                }
            });
        }

        if (callbackCalled) {
            return;
        }

        if (envVarConf["nconf-yaml"]) {
            let files: string[] = envVarConf["nconf-yaml"] as Array<string>;
            if (!_.isArray(envVarConf["nconf-yaml"])) {
                files = [envVarConf["nconf-yaml"] as string];
            }

            _.forEach(files, (filename: string) => {
                const fullpath: string = PathUtils.getAsAbsolutePath(filename, this.config.workingDir);
                try {
                    // maybe in the future allow reading different encodings?
                    const envvars: object = yaml.safeLoad(
                        fs.readFileSync(fullpath, "utf8"));

                    if (envvars) {
                        _.forEach(envvars, (value: object, key: string) => {
                            this.projectVars.set(key, value);
                        });
                    }

                    return true;
                } catch (e) {
                    callback(ErrorUtil.customize(
                        e, "There was a problem in loading the project environment variables from " +
                        this.type + "env-var-files:nconf-yaml. The file " + fullpath + " failed to load. Error below."));
                    callbackCalled = true;
                    return false;
                }
            });
        }

        if (!callbackCalled) {
            callback(null);
        }
    }

    private createLoggers(callback: async.ErrorCallback<Error>): void {
        const label: string = this.config.project.slug + "/" + this.config.job.id + "/" + this.type;
        this.loggers = [];
        this.createNamedLoggers(callback, label, this.loggers);
    }

    private createNamedLoggers(callback: async.ErrorCallback<Error>, label: string, loggers: any[]): void {
        // first create the console logger...
        const loggerOptions: ILogOptions = this.options.get(this.type + ":log") || {};
        let consoleLoggerAttached: boolean = false;

        const fns: async.AsyncVoidFunction<Error>[] = [];

        _.forEach(loggerOptions, (value: any, key: string) => {
            // check if we have a plugin to support this.
            const logPlugin: ILogPlugin = Plugins["log:" + key] as any;

            if (logPlugin && value) {
                fns.push((innerCallback: (err: Error) => void) => {
                    try {
                        logPlugin(
                            {
                                config: this.config,
                                label: label,
                                options: value
                            } as ILogPluginParams,
                            (err: Error, result: any) => {
                                if (err) {
                                    innerCallback(err);
                                    return;
                                }

                                if (result) {
                                    if (_.isArray(result)) {
                                        _.forEach(result as Array<any>, (transport: any) => {
                                            loggers.push(transport);
                                        });
                                    } else {
                                        loggers.push(result);
                                    }
                                }

                                innerCallback(null);
                            }
                        );
                    } catch (e) {
                        innerCallback(e);
                    }
                });
            }

            if (key === "console") {
                consoleLoggerAttached = true;
            }
        });

        // we always want to attach a console logger
        if (!consoleLoggerAttached) {
            (Plugins["log:console"] as ILogPlugin)(
                {
                    config: this.config,
                    label: label,
                    options: {
                        colorize: true,
                        level: ELogLevel.info,
                        json: false,
                        showLevel: true,
                        label: label,
                        timestamp: true
                    }
                } as ILogPluginParams,
                (err: Error, result: any) => {
                    if (err) {
                        // since we haven't really initialized logging yet...
                        // tslint:disable-next-line
                        console.error(err);
                        return;
                    }

                    if (result) {
                        if (_.isArray(result)) {
                            _.forEach(result as Array<any>, (transport: any) => {
                                loggers.push(transport);
                            });
                        } else {
                            loggers.push(result);
                        }
                    }
                }
            );
        }

        if (fns.length === 0) {
            callback(null);
        } else {
            async.series(fns, callback);
        }
    }

    private createLogger(callback: async.ErrorCallback<Error>): void {
        this.logger = this.createFromLoggers(this.loggers);
        callback(null);
    }

    private createFromLoggers(loggers: any[]): ILogger {
        return new (Winston.Logger)(
            {
                transports: loggers
            }
        );
    }

    private initializePaths(callback: async.ErrorCallback<Error>): void {
        this.taskOutDir = path.resolve(this.config.jobOutDir, this.type);
        mkdirp(this.taskOutDir, (err) => {
            callback(err);
        });
    }

    private unescapeSpecialJsonCharacters(input: string): string {
        return input
            .replace(/\\"/g, "\"")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\b/g, "\b")
            .replace(/\\f/g, "\f")
            .replace(/\\t/g, "\t")
            .replace(/\\u2028/g, "\u2028")
            .replace(/\\u2029/g, "\u2029");
    }
}

const BLACKLISTED_PLUGINS_KEYS: _.Dictionary<boolean> = {
    "do": true,
    "log": true,
    "env-var-files": true,
};