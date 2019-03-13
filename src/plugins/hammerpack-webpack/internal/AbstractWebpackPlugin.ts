import async = require("async");
import _ = require("lodash");
import crypto = require("crypto");
import anymatch = require("anymatch");
import psnode = require("ps-node");
import kill = require("tree-kill");
import findprocess = require("find-process");
import path = require("path");
import notifier = require("node-notifier");
import HappyPack = require("happypack");
import webpack = require("webpack");
import semver = require("semver");
import ExtractTextPlugin = require("extract-text-webpack-plugin");
import * as os from "os";
import * as fs from "fs";
import {ETaskType} from "../../../public/api/ETaskType";
import {Task} from "../../../internal/Task";
import {EWatchEventType} from "../../../public/plugins/IWatchListener";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {ILogger} from "../../../public/api/ILogger";
import {PathUtils} from "../../../public/utils/PathUtils";
import {NodeExternals} from "./NodeExternals";
import {ErrorUtil} from "../../../public/utils/ErrorUtil";
import {ChildProcess, fork} from "child_process";
import {IEnvVarConfig} from "../../../public/options/IEnvVarConfig";
import {IWebpackBundleOptions} from "./IWebpackBundleOptions";
import mkdirp = require("mkdirp");
import {IWebpackCopyStructure} from "../configure/IWebpackCopyStructure";
import {IWebpackOptions} from "./IWebpackOptions";
import {IInverseAliasOptions} from "./IInverseAliasOptions";
import * as ts from "typescript";

/**
 */
export abstract class AbstractWebpackPlugin implements ITaskPluginInstance {
    protected params: Task;
    protected logger: ILogger;
    protected compileAgain: boolean = false;
    protected runProcess: ChildProcess;
    protected watchReady: boolean;
    protected nodeExternals: NodeExternals;
    protected totalProgress: number;
    protected compileStartTime: number;
    protected results: Array<async.AsyncResultCallback<object, Error>> = [];
    protected somethingChanged: boolean = true;
    protected interestingFiles: _.Dictionary<true>;

    constructor(params: Task, logger: ILogger) {
        this.params = params;
        this.logger = logger;

        process.on("SIGTERM", this.onSigTerm);
    }

    /**
     * Called for the develop ETaskType.
     *
     * @param {AsyncResultCallback<object, Error>} result
     */
    develop(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    /**
     * Called for the build ETaskType.
     *
     * @param {AsyncResultCallback<object, Error>} result
     */
    build(result: async.AsyncResultCallback<object, Error>): void {
        this.compile(_.once(result));
    }

    /**
     * Will be called whenever files are changed in the repo. You can ignore these or act upon them as you wish.
     *
     * @param {EWatchEventType} eventType
     * @param {string} fileOrDirPath
     * @param {ErrorCallback<Error>} callback
     */
    onWatch(eventType: EWatchEventType, fileOrDirPath: string, callback: async.ErrorCallback<Error>): void {
        this.somethingChanged = true;

        if (!this.watchReady) {
            if (eventType === EWatchEventType.READY) {
                this.watchReady = true;
            }

            callback(null);

            return;
        }

        if (this.getInterestingFiles()[fileOrDirPath] &&
            (eventType === EWatchEventType.CHANGE || eventType === EWatchEventType.ADD_FILE)) {
            this.copyInterestingServerFiles(true, () => {
                this.params.reloadEnvVars(() => {
                    setTimeout(() => this.compile(), 0);
                });
            });
        }

        callback(null);
    }

    /**
     * Gets the name of the plugin. This name will be used to look up the parameters from the config.
     *
     * @returns {string}
     */
    protected abstract getPluginName(): string;

    /**
     * Whether we are currently compiling webpack.
     *
     * @returns {boolean}
     */
    protected abstract isCurrentlyCompiling(): boolean;

    /**
     * A chance to stop some internal tasks and restart compilation before it is even started.
     *
     * @returns {boolean}
     */
    protected abstract preemptCompile(): boolean;

    /**
     * Actually compile stuff using webpack.
     */
    protected abstract doCompile(): void;

    /**
     * Called when the compilation is complete. Call this from the progress handler of webpack when it is at 100%.
     */
    protected abstract onDoneCompile(): void;

    /**
     * Gets the name of the start script.
     *
     * @returns {string}
     */
    protected abstract getStartScriptName(): string;

    /**
     * Gets the content of the start script (in Javascript).
     *
     * @returns {string}
     */
    protected abstract getStartScriptContent(): string;

    /**
     * Gets the environment variables that will be set when the server process is run for the develop task.
     *
     * @returns {object}
     */
    protected abstract getEnvVariablesForProcess(): object;

    /**
     * Gets require aliases.
     *
     * @returns {_.Dictionary<string>}
     */
    protected abstract getAliases(): _.Dictionary<string>;

    /**
     * Gets the extra NPM modules.
     *
     * @returns {_.Dictionary<string>}
     */
    protected abstract getExtraNpmModules(): string[];

    /**
     * Gets the bundle options that contain basic information about the bundle.
     *
     * @returns {IWebpackBundleOptions}
     */
    protected abstract getBundleOptions(): IWebpackBundleOptions;

    /**
     * Gets the webpack options that contain basic information about the generated output.
     *
     * @returns {IWebpackBundleOptions}
     */
    protected abstract getWebpackOptions(): IWebpackOptions;

    /**
     * Whether the develop process can be run now.
     *
     * @returns {boolean}
     */
    protected abstract canRunProcess(): boolean;

    /**
     * Gets called from the develop and build tasks.
     *
     * @param {AsyncResultCallback<object, Error>} result
     */
    protected compile(result?: async.AsyncResultCallback<object, Error>): void {
        if (result) {
            this.results.push(result);
        }

        if (this.isCurrentlyCompiling()) {
            this.compileAgain = true;
        } else {

            if (this.preemptCompile()) {
                setTimeout(() => this.compile(), 1000);
                return;
            }

            this.killCurrentProcess(_.noop);
            this.runProcess = null;
            this.compileAgain = false;
            this.totalProgress = 0;
            this.compileStartTime = new Date().getTime();

            const inverseAliases = this.getInverseAliases();

            // collect all the require statements so we can later create a separate package.json
            this.nodeExternals = new NodeExternals(
                this.logger,
                this.params.config.repo.packageJson,
                this.params.config.repo.rootDirectoryPath,
                this.params.config.repo.rootSrcDirectoryPath,
                path.resolve(this.params.config.jobOutDir, this.params.type),
                this.params.config.workingDir,
                this.params.config.project.dependencies,
                inverseAliases
            );

            this.doCompile();
        }
    }

    /**
     * Gets the inverse aliases.
     *
     * @returns {Array<IInverseAliasOptions>}
     */
    protected getInverseAliases() {
        let inverseAliases: Array<IInverseAliasOptions>;
        const webpackOptions = this.getWebpackOptions();
        if (webpackOptions.inverseAlias) {
            if (_.isArray(webpackOptions.inverseAlias)) {
                inverseAliases = webpackOptions.inverseAlias as Array<IInverseAliasOptions>;
            } else if (_.isObject(webpackOptions.inverseAlias)) {
                inverseAliases = [webpackOptions.inverseAlias as IInverseAliasOptions];
            }
        }
        return inverseAliases;
    }

    /**
     * Utility method to get the JSON options for webpack stats.
     *
     * @returns {webpack.Stats.ToJsonOptionsObject}
     */
    protected getStatsJsonOptions(): webpack.Stats.ToJsonOptionsObject {
        return {
            chunks: false,
            chunkModules: false,
            chunkOrigins: false,
            modules: false,
            cached: true,
            assets: true,
            source: false,
            children: false,
            timings: true,
            hash: false,
            version: false,
            errorDetails: true,
            reasons: true,
            warningsFilter: [
                "Critical dependency: the request of a dependency is an expression"
            ]
        };
    }

    /**
     * Utility method to get the string (console output) options for webpack stats.
     *
     * @returns {webpack.Stats.ToStringOptionsObject}
     */
    protected getStatsStringOptions(): webpack.Stats.ToStringOptionsObject {
        return _.extend(this.getStatsJsonOptions(), {
            colors: this.params.type === ETaskType.develop,
        });
    }

    /**
     * Outputs the given stats using getStatsStringOptions to the logger or the console.
     *
     * @param {webpack.Stats} stats
     */
    protected outputStats(stats: webpack.Stats): void {
        const statOptions: webpack.Stats.ToStringOptionsObject = this.getStatsStringOptions();

        // if we are in development mode, we just want to output to console with all it's colors.
        if (this.params.type === ETaskType.develop) {
            // tslint:disable-next-line
            console.log(stats.toString(statOptions));
            // tslint:disable-next-line
            console.log("\n\n\n");
        } else if (stats.hasErrors()) {
            this.logger.error(stats.toString(statOptions));
        } else if (stats.hasWarnings()) {
            this.logger.warn(stats.toString(statOptions));
        } else {
            this.logger.info(stats.toString(statOptions));
        }
    }

    /**
     * Copies any interesting files in the webpack destination directory. This includes environment files, yarn.lock
     * file, asset files that are defined.
     *
     * @param {boolean} wasCompiling
     * @param {ErrorCallback<Error>} callback
     */
    protected copyInterestingServerFiles(wasCompiling: boolean, callback: async.ErrorCallback<Error>): void {
        const fns: Array<async.AsyncVoidFunction<Error>> = [];

        if (wasCompiling) {
            // copy the start-webservice file...
            const startScriptFilePath = this.getStartScriptFilePath();
            if (startScriptFilePath) {
                fs.writeFileSync(startScriptFilePath, this.getStartScriptContent());
            }

            fns.push((callback: async.ErrorCallback<Error>) => this.copyEnvFiles(callback));
            fns.push((callback: async.ErrorCallback<Error>) => this.copyYarnLockFile(callback));
            fns.push((callback: async.ErrorCallback<Error>) => this.copyAssetFiles(callback));
            fns.push((callback: async.ErrorCallback<Error>) => {
                this.params.config.cache.flush((err: Error) => {
                    if (err) {
                        this.logger.error(ErrorUtil.customize(err, "An error occurred while flushing the cache."));
                    }
                });
                callback();
            });
            this.writePackageJson();
        }

        async.parallel(fns, callback);
    }

    /**
     * Gets the interesting files that we need to watch.
     *
     * @returns {_.Dictionary<true>}
     */
    protected getInterestingFiles(): _.Dictionary<true> {
        if (this.interestingFiles) {
            return this.interestingFiles;
        }

        this.interestingFiles = {};

        _.forEach(this.getEnvFiles(), (file: string) => this.interestingFiles[file] = true);

        this.interestingFiles[path.resolve(this.params.config.repo.rootDirectoryPath, "yarn.lock")] = true;

        if (this.getBundleOptions().copy) {
            const copyAndDirs: string[] = _.isArray(this.getBundleOptions().copy)
                ? this.getBundleOptions().copy as string[]
                : [this.getBundleOptions().copy as string];

            _.forEach(copyAndDirs, (file: string) => {
                this.interestingFiles[file] = true;
            });
        }

        return this.interestingFiles;
    }

    /**
     * Pops a notification in the corner of the window for develop task, otherwise notifies the message in the log.
     * @param {string} title
     * @param {string} message
     */
    protected notify(title: string, message: string): void {
        if (this.params.type === ETaskType.develop) {
            notifier.notify({
                title: title,
                message: message,
                sound: "Pop" as any
            });
        } else {
            this.logger.info(title + ": " + message);
        }
    }

    /**
     * Resets the results.
     *
     * @param {Error} err
     */
    protected callResults(err?: Error, output?: object): void {
        _.forEach(this.results, (result: async.AsyncResultCallback<object, Error>) => {
            result(err, output);
        });

        // reset the stats
        this.results = [];
    }

    /**
     * Gets the environment files defined for the task.
     *
     * @returns {string[]}
     */
    protected getEnvFiles(): string[] {
        const files: string[] = [];
        const envVarConf: IEnvVarConfig = this.params.options.get("env-var-files");
        if (envVarConf) {
            if (envVarConf.dotenv) {
                if (_.isString(envVarConf.dotenv)) {
                    files.push(PathUtils.getAsAbsolutePath(envVarConf.dotenv as string, this.params.config.workingDir));
                } else {
                    for (const file of envVarConf.dotenv as Array<string>) {
                        files.push(PathUtils.getAsAbsolutePath(file, this.params.config.workingDir));
                    }
                }
            }
            if (envVarConf["nconf-yaml"]) {
                if (_.isString(envVarConf["nconf-yaml"])) {
                    files.push(
                        PathUtils.getAsAbsolutePath(envVarConf["nconf-yaml"] as string, this.params.config.workingDir));
                } else {
                    for (const file of envVarConf["nconf-yaml"] as Array<string>) {
                        files.push(PathUtils.getAsAbsolutePath(file, this.params.config.workingDir));
                    }
                }
            }
            if (envVarConf["nconf-json"]) {
                if (_.isString(envVarConf["nconf-json"])) {
                    files.push(
                        PathUtils.getAsAbsolutePath(envVarConf["nconf-json"] as string, this.params.config.workingDir));
                } else {
                    for (const file of envVarConf["nconf-json"] as Array<string>) {
                        files.push(PathUtils.getAsAbsolutePath(file, this.params.config.workingDir));
                    }
                }
            }
        }

        return files;
    }

    /**
     * Copies the environment files defined for the task.
     *
     * @param {ErrorCallback<Error>} cb
     */
    protected copyEnvFiles(cb: async.ErrorCallback<Error>): void {
        const envFiles = this.getEnvFiles();
        if (envFiles.length > 0) {
            async.parallel(_.map(
                envFiles,
                (file: string) => (callback: async.ErrorCallback<Error>) => this.copyFile(file, callback)
            ), cb);
        } else {
            cb();
        }
    }

    /**
     * Copies the yarn.lock file in the repo.
     *
     * @param {ErrorCallback<Error>} cb
     */
    protected copyYarnLockFile(cb: async.ErrorCallback<Error>): void {
        // if there is a yarn lock file, copy it. But only if it is a build task
        if (this.params.type === ETaskType.build) {
            const yarnLockFile: string = path.resolve(this.params.config.repo.rootDirectoryPath, "yarn.lock");
            if (fs.existsSync(yarnLockFile)) {
                this.copyFile(yarnLockFile, cb);
                return;
            }
        }

        cb();
    }

    /**
     * Gets the all the typings files into the fileNames map.
     *
     * @param {string} dir
     * @param {_.Dictionary<true>} fileNames
     */
    protected getTypings(dir: string, fileNames: _.Dictionary<true>): void {
        // good place to change the typings for inverseAliases
        const srcDir = this.params.config.repo.rootSrcDirectoryPath;
        const outputDir = path.resolve(this.params.config.jobOutDir, this.params.type);
        this.changeTypingsForDirOrFile(dir, this.getInverseAliases(), outputDir, srcDir);

        const contents = fs.readdirSync(dir);
        _.forEach(contents, (content) => {
            const file = path.resolve(dir, content);
            const stats = fs.statSync(file);
            if (stats.isDirectory()) {
                // first check if this directory is something we should read typings from.
                const relativeDirPath = path.relative(this.params.taskOutDir, file);
                const srcDirPath = path.resolve(srcDir, relativeDirPath);
                const relativeToProjectDir = path.relative(this.params.config.project.directory, srcDirPath);
                if (!_.startsWith(relativeToProjectDir, "..")) {
                    this.getTypings(file, fileNames);
                }
            } else if (stats.isFile() && file.endsWith(".d.ts")) {
                fileNames[file] = true;
            }
        });
    }

    /**
     * Updates typings files to reflect the inverseAlias settings.
     *
     * @param {string} dirOrFile
     * @param {string} from
     * @param {string} to
     */
    protected changeTypingsForDirOrFile(
        dirOrFile: string, inverseAliases: Array<IInverseAliasOptions>, outputDir: string, srcDir: string): void {
        if (!inverseAliases || inverseAliases.length === 0) {
            return;
        }

        const stats = fs.statSync(dirOrFile);
        if (stats.isDirectory()) {
            const dirContents: string[] = fs.readdirSync(dirOrFile);
            for (let file of dirContents) {
                file = path.resolve(dirOrFile, file);
                if (file.endsWith(".d.ts") && fs.statSync(file).isFile()) {
                    this.changeTypingsForFile(file, dirOrFile, inverseAliases, outputDir, srcDir);
                }
            }
        } else if (stats.isFile() && dirOrFile.endsWith(".js")) {
            // change the extension
            const defFile = dirOrFile.substring(0, dirOrFile.indexOf(".js")) + ".d.ts";
            if (fs.existsSync(defFile)) {
                this.changeTypingsForFile(defFile, path.parse(defFile).dir, inverseAliases, outputDir, srcDir);
            }
        }
    }

    protected changeTypingsForFile(
        file: string, context: string, inverseAliases: Array<IInverseAliasOptions>, outputDir: string, srcDir: string) {
        let fileContents = fs.readFileSync(file, "utf8");

        // now replace all imports
        const sourceFile = ts.createSourceFile(file, fileContents, ts.ScriptTarget.Latest);
        const imports: string[] = [];

        function walkNode(node: ts.Node): void {
            switch (node.kind) {
                case ts.SyntaxKind.ImportDeclaration: // import x from "xyz";
                case ts.SyntaxKind.ExportDeclaration: // export x from "xyz";
                    const moduleSpecifier = (node as ts.ImportDeclaration).moduleSpecifier;
                    if (moduleSpecifier) {
                        if (!moduleSpecifier.parent) {
                            moduleSpecifier.parent = node;
                        }
                        imports.push(moduleSpecifier.getText(sourceFile));
                    }
                    break;
                case ts.SyntaxKind.ImportEqualsDeclaration: // import y = require("y");
                    const externalModuleReference: ts.ExternalModuleReference =
                        ((node as ts.ImportEqualsDeclaration).moduleReference as ts.ExternalModuleReference);
                    if (externalModuleReference) {
                        if (!externalModuleReference.parent) {
                            externalModuleReference.parent = node as ts.ImportEqualsDeclaration;
                        }

                        if (externalModuleReference.expression) {
                            if (!externalModuleReference.expression.parent) {
                                externalModuleReference.expression.parent = externalModuleReference;
                            }

                            imports.push(
                                externalModuleReference
                                    .expression.getText(sourceFile));
                        }
                    }

                    break;
                case ts.SyntaxKind.CallExpression: // require("z"); or require.ensure(["a", "b"], ...)
                    const callExpression: ts.CallExpression = (node as ts.CallExpression);
                    if (callExpression) {
                        const expression = callExpression.expression;
                        if (expression) {
                            if (!expression.parent) {
                                expression.parent = callExpression;
                            }

                            const callName: string = expression.getText(sourceFile);
                            if (callName === "require") {
                                const argument = callExpression.arguments[0];
                                if (argument) {
                                    if (!argument.parent) {
                                        argument.parent = callExpression;
                                    }
                                    imports.push(argument.getText(sourceFile));
                                }
                            } else if (callName === "require.ensure" &&
                                callExpression.arguments[0].kind === ts.SyntaxKind.ArrayLiteralExpression) {
                                const argument2 = callExpression.arguments[0];
                                if (!argument2.parent) {
                                    argument2.parent = callExpression;
                                }

                                (argument2 as ts.ArrayLiteralExpression).forEachChild(
                                    (x: ts.Node) => {
                                        if (!x.parent) {
                                            x.parent = argument2;
                                        }
                                        imports.push(x.getText(sourceFile));
                                    });
                            }
                        }
                    }
                    break;
                default:
                // nothing
            }

            const children: ts.Node[] = node.getChildren(sourceFile);
            for (const child of children) {
                if (!child.parent) {
                    child.parent = node;
                }
                walkNode(child);
            }
        }

        walkNode(sourceFile);

        // now we should have all the imports, so replace them
        for (const originalImport of imports) {
            const resolvedImport = _.trim(originalImport, "\"");
            if (resolvedImport.startsWith(".")) {
                // now go through all the inverse aliases

                for (const inverseAlias of inverseAliases) {
                    let doWrite: boolean = false;
                    const relativePath = path.relative(outputDir, path.resolve(context, resolvedImport));
                    const actualImport = path.resolve(srcDir, relativePath);
                    const pathToMatch = PathUtils.getAsAbsolutePath(inverseAlias.find, this.params.config.workingDir);

                    const originalFile = path.resolve(srcDir, path.relative(outputDir, file)).replace(".d.ts", ".ts");

                    if (!anymatch(pathToMatch, originalFile) && !pathToMatch.startsWith(path.parse(file).dir) &&
                        (anymatch(pathToMatch, actualImport) || pathToMatch.startsWith(actualImport))) {
                        fileContents =
                            fileContents.replace(new RegExp(originalImport, "g"), `"${inverseAlias.replace}"`);
                        doWrite = true;
                    }

                    if (doWrite) {
                        const referenceToAdd = `/// <reference types="${inverseAlias.replace}" />`;

                        // first add the reference at the top
                        if (fileContents.indexOf(referenceToAdd) < 0) {
                            fileContents = referenceToAdd + "\n" + fileContents;
                        }

                        // write the file back
                        fs.writeFileSync(file, fileContents);
                    }
                }
            }
        }
    }

    /**
     * Returns the files and directories that need to be copied into the directory where the bundle resides.
     *
     * @returns {(string | IWebpackCopyStructure)[]}
     */
    protected getAssetsToCopy(): (string|IWebpackCopyStructure)[] {
        // also check if there are any typings that need to be copied over.
        const typingsFiles: _.Dictionary<true> = {};
        this.getTypings(this.params.taskOutDir, typingsFiles);
        const assets: (string | IWebpackCopyStructure)[] = _.map(
            typingsFiles, (value: true, file: string): IWebpackCopyStructure => {
                return {
                    from: file,
                    to: "typings" + path.sep + path.relative(this.params.taskOutDir, path.parse(file).dir)
                };
            });

        // add the user defined assets afterwards incase they have customized the copy with string replacements
        if (_.isArray(this.getBundleOptions().copy)) {
            _.forEach(
                this.getBundleOptions().copy as Array<string | IWebpackCopyStructure>, (item) => assets.push(item));
        } else {
            assets.push(this.getBundleOptions().copy as string|IWebpackCopyStructure);
        }

        return assets;
    }

    /**
     * Copies the asset files that are defined in the parameters.
     *
     * @param {ErrorCallback<Error>} cb
     */
    protected copyAssetFiles(cb: async.ErrorCallback<Error>): void {
        if (!this.getBundleOptions().copy) {
            cb();
            return;
        }

        const copyAndDirs: (string|IWebpackCopyStructure)[] = this.getAssetsToCopy();

        const fns: Array<async.AsyncVoidFunction<Error>> = [];

        _.forEach(copyAndDirs, (fileOrDir: string|IWebpackCopyStructure) => {
            let copyFrom: string;
            let stringSubstitutions: _.Dictionary<string>;
            let to: string;
            if (_.isString(fileOrDir)) {
                copyFrom = fileOrDir as string;
            } else if (_.isObject(fileOrDir)) {
                const copyStructure: IWebpackCopyStructure = fileOrDir as IWebpackCopyStructure;
                copyFrom = copyStructure.from;
                to = copyStructure.to;
                stringSubstitutions = (copyStructure).replace;
            }

            copyFrom = PathUtils.getAsAbsolutePath(copyFrom, this.params.config.workingDir);
            if (fs.existsSync(copyFrom)) {
                const stats = fs.statSync(copyFrom);
                if (stats.isFile()) {
                    fns.push((callback: async.ErrorCallback<Error>) => {
                        this.copyFile(copyFrom, callback, to, stringSubstitutions);
                    });
                } else if (stats.isDirectory()) {
                    fns.push((callback: async.ErrorCallback<Error>) => {
                        this.copyDir(copyFrom, callback, to, stringSubstitutions);
                    });
                } else {
                    this.logger.warn("The file specified in server:copy " + fileOrDir + " is not a file or a directory.");
                }
            } else {
                this.logger.warn("The file specified in server:copy " + fileOrDir + " does not exist.");
            }
        });

        if (fns.length > 0) {
            async.parallel(fns, cb);
        } else {
            cb();
        }
    }

    /**
     * Copies a file from the source folder to the destination folder.
     *
     * @param {string} srcFilePath
     * @param {ErrorCallback<Error>} cb
     */
    protected copyFile(srcFilePath: string, cb: async.ErrorCallback<Error>, to?: string, substitutions?: _.Dictionary<string>): void {
        let destFilePath: string;
        if (to) {
            destFilePath = path.resolve(this.params.config.jobOutDir, "dist", to, path.parse(srcFilePath).base);
            mkdirp.sync(path.parse(destFilePath).dir);
        } else {
            destFilePath = path.resolve(this.params.config.jobOutDir, "dist", path.parse(srcFilePath).base);
        }

        this.params.copyFile(
            srcFilePath,
            destFilePath,
            (err: Error) => {
                if (err) {
                    cb(ErrorUtil.customize(err, "There was an error copying the file " + srcFilePath + " to " +
                        destFilePath));
                } else {
                    cb();
                }
            },
            substitutions
        );
    }

    /**
     * Copies the srcDir to the destination folder.
     *
     * @param {string} srcDir
     * @param {ErrorCallback<Error>} cb
     */
    protected copyDir(srcDir: string, cb: async.ErrorCallback<Error>, to?: string, substitutions?: _.Dictionary<string>): void {
        let destDir: string;
        if (to) {
            destDir = path.resolve(this.params.config.jobOutDir, "dist", to);
            mkdirp.sync(destDir);
        } else {
            destDir = path.resolve(this.params.config.jobOutDir, "dist");
        }

        this.params.copyDir(
            srcDir,
            destDir,
            (err: Error) => {
                if (err) {
                    cb(ErrorUtil.customize(err, "There was an error copying the directory " + srcDir + " to " +
                        destDir));
                } else {
                    cb();
                }
            },
            substitutions
        );
    }

    /**
     * Stringifies only the primitive values in the given object, ideal for the define plugin to use.
     *
     * @param {object} defineObject
     * @returns {object}
     */
    protected stringifyDefinePlugin(defineObject: object): object {
        const retObject: object = {};
        _.forEach(defineObject, (value: any, key: string) => {
            if (_.isObject(value)) {
                retObject[key] = this.stringifyDefinePlugin(value);
            } else {
                retObject[key] = JSON.stringify(value);
            }
        });

        return retObject;
    }

    /**
     * Sets the resolve part of webpack configuration object so that javascript files from the correct directory can be
     * resolved.
     *
     * @param {webpack.Configuration} config
     */
    protected setResolve(config: webpack.Configuration) {
        const aliases: _.Dictionary<string> = {};
        _.forEach(this.getAliases(), (value: string, key: string) => {
            aliases[key] = this.params.getDestPath(PathUtils.getAsAbsolutePath(value, this.params.config.workingDir));
        });

        config.resolve = {
            extensions: [".js"],
            alias: aliases
        };
    }

    /**
     * Sets the loaders / rules part of webpack.
     *
     * @param {ISetLoadersParams} params
     */
    protected setLoaders(params: ISetLoadersParams) {

        const {config, useHotLoader, useExtractTextPlugin, ignoreCss, doNotIgnoreFileLoader, addSourceMaps} = params;

        const cacheLoader: any = {
            loader: "cache-loader",
            options: {
                cacheKey: this.cacheKey.bind(this),
                read: this.readCacheLoaderEntry.bind(this),
                write: this.writeCacheLoaderEntry.bind(this)
            }
        };

        config.module = {
            rules: [
                {
                    test: /\.js$/,
                    use: [cacheLoader],
                },
                {
                    test: /\.js\.map$/,
                    loader: "ignore-loader"
                },
                {
                    test: /\.json$/,
                    loader: "happypack/loader?id=json-loader"
                },
                {
                    test: /\.yaml$/,
                    loader: "yaml-loader"
                }
            ]
        };

        if (!doNotIgnoreFileLoader) {
            config.module.rules.push({
                test: /\.(jp[e]?g|png|gif|svg|ico)(\?([a-z0-9=\.]+)?)?$/i,
                loader: "ignore-loader"
            });
            config.module.rules.push({
                test: /\.(htm|html|txt|md|csv|pdf|doc|xls|zip)(\?([a-z0-9=\.]+)?)?$/,
                loader: "ignore-loader"
            });
            config.module.rules.push({
                test: /\.(woff|woff2|eot|ttf)(\?([a-z0-9=\.]+)?)?$/,
                loader: "ignore-loader"
            });
        } else {
            // we only want to load non-binary files as text files.
            config.module.rules.push({
                test: /\.(htm|html|txt|md|csv|svg)(\?([a-z0-9=\.]+)?)?$/,
                loader: "raw-loader"
            });

            // ignore the rest
            config.module.rules.push({
                test: /\.(woff|woff2|eot|ttf|pdf|doc|xls|zip|jp[e]?g|png|gif|ico)(\?([a-z0-9=\.]+)?)?$/,
                loader: "ignore-loader"
            });
        }

        if (addSourceMaps) {
            config.module.rules.push({
                test: /\.js$/,
                use: ["source-map-loader"],
                enforce: "pre",
                exclude: path.resolve(this.params.config.repo.rootDirectoryPath, "node_modules")
            });
        }

        if (useHotLoader) {
            config.module.rules.push({
                test: /\.js$/,
                loaders: [
                    "react-hot-loader/webpack",
                ]
            });
        }

        if (ignoreCss) {
            config.module.rules.push({
                test: /\.css$/,
                loader: "ignore-loader"
            });
            config.module.rules.push({
                test: /(\.less)$/,
                loader: "ignore-loader"
            });
        } else {
            if (!useExtractTextPlugin) {
                config.module.rules.push({
                    test: /\.css$/,
                    loaders: [cacheLoader, "happypack/loader?id=happy-css-loader"]
                });
                config.module.rules.push({
                    test: /\.less$/,
                    loaders: [cacheLoader, "happypack/loader?id=happy-less-loader"]
                });
            } else {
                config.module.rules.push({
                    test: /\.css$/,
                    use: ExtractTextPlugin.extract({fallback: "style-loader", use: ["css-loader?compress"]})
                });
                config.module.rules.push({
                    test: /\.less$/,
                    use: ExtractTextPlugin.extract(
                        {fallback: "style-loader", use: ["css-loader?compress", "less-loader"]})
                });
            }
        }
    }

    /**
     * Gets the cache key to use for a request for the CacheLoader.
     *
     * @param options
     * @param {string} request
     * @returns {string}
     */
    protected cacheKey(options: any, request: string): string {
        return this.getPluginName() + ":" + crypto.createHash("md5").update(request).digest("hex");
    }

    /**
     * Reads the cache entry for the CacheLoader.
     *
     * @param {string} key
     * @param {AsyncResultCallback<any, Error>} callback
     */
    protected readCacheLoaderEntry(key: string, callback: async.AsyncResultCallback<any, Error>): void {
        this.params.config.cache.get(key, (err: Error, val: any) => {
            if (err) {
                callback(err);
            } else if (!val) {
                callback(new Error(`Key ${key} not found in cache`));
            } else {
                callback(null, val);
            }
        });
    }

    /**
     * Writes a cache entry for the CacheLoader
     *
     * @param {string} key
     * @param data
     * @param {AsyncVoidFunction<Error>} callback
     */
    protected writeCacheLoaderEntry(key: string, data: any, callback: async.AsyncVoidFunction<Error>): void {
        this.params.config.cache.setMemSync(key, data);
        callback(null);
    }

    /**
     * Sets up happy pack plugins.
     *
     * @returns {HappyPack[]}
     */
    protected getHappyPackPlugins(): HappyPack[] {
        let cpus: number = os.cpus().length;
        if (!cpus || cpus < 2) {
            cpus = 2;
        }
        const threadPool: HappyPack.ThreadPool = HappyPack.ThreadPool({size: cpus});

        return [
            new HappyPack({
                id: "happy-css-loader",
                threadPool: threadPool,
                loaders: ["style-loader!css-loader"]
            }),
            new HappyPack({
                id: "happy-less-loader",
                threadPool: threadPool,
                loaders: ["style-loader!css-loader!less-loader"]
            }),
            new HappyPack({
                id: "json-loader",
                threadPool: threadPool,
                loaders: ["json-loader"]
            }),
            new HappyPack({
                id: "js",
                threadPool: threadPool,
                loaders: [
                    "react-hot-loader/webpack"
                ]
            })
        ];
    }

    /**
     * Gets the file path of the start script.
     *
     * @returns {string}
     */
    protected getStartScriptFilePath(): string {
        const startScriptName = this.getStartScriptName();
        if (startScriptName) {
            mkdirp.sync(path.resolve(this.params.config.jobOutDir, "dist"));
            return path.resolve(this.params.config.jobOutDir, "dist", startScriptName);
        } else {
            return null;
        }
    }

    /**
     * Gets the entry file path.
     *
     * @returns {string}
     */
    protected getEntry(): string {
        return this.normalizeEntry(this.getBundleOptions().entry);
    }

    /**
     * Normalizes the entry by, for example, fixing the destination path and/or the file extension.
     *
     * @returns {string}
     */
    protected normalizeEntry(filename: string): string {
        filename = PathUtils.getAsAbsolutePath(filename, this.params.config.workingDir);
        filename = this.params.getDestPath(filename);
        const parsedPath: path.ParsedPath = path.parse(filename);
        if (!parsedPath.ext) {
            return filename + ".js";
        } else if (parsedPath.ext === ".ts" || parsedPath.ext === ".tsx") {
            parsedPath.ext = ".js";
            return path.format(parsedPath);
        } else {
            return filename;
        }
    }

    /**
     * Gets whether to enable HTTPS.
     *
     * @returns {boolean}
     */
    protected getEnableHttps(): boolean {
        return this.getOptionDefaultToProjectOptionsAsBoolean(
            false, "server:enableHttps", "ENABLEHTTPS", "ENABLE_HTTPS");
    }

    /**
     * Gets which host to run the server on.
     *
     * @returns {string}
     */
    protected getHost(): string {
        return this.getOptionDefaultToProjectOptionsAsString("localhost", "server:host", "HOST");
    }

    /**
     * Gets which port to run the server on.
     *
     * @returns {number}
     */
    protected getPort(): number {
        const port: number = this.getEnableHttps() ? 443 : 80;
        return this.getOptionDefaultToProjectOptionsAsNumber(port, "server:port", "PORT");
    }

    /**
     * Gets an option as a boolean. See `getOptionDefaultToProjectOptions(..)`.
     *
     * @param defaultValue
     * @param {string} keys
     * @returns {boolean}
     */
    protected getOptionDefaultToProjectOptionsAsBoolean(defaultValue: any, ...keys: string[]): boolean {
        const retVal: string = this.getOptionDefaultToProjectOptions(defaultValue, ...keys);
        if (_.isString(retVal)) {
            return retVal === "true";
        } else {
            return !!retVal;
        }
    }

    /**
     * Gets an option as a number. See `getOptionDefaultToProjectOptions(..)`.
     * @param defaultValue
     * @param {string} keys
     * @returns {number}
     */
    protected getOptionDefaultToProjectOptionsAsNumber(defaultValue: any, ...keys: string[]): number {
        const retVal: string = this.getOptionDefaultToProjectOptions(defaultValue, ...keys);
        if (_.isString(retVal)) {
            return parseInt(retVal, 10);
        } else if (_.isNumber(retVal)) {
            return retVal as number;
        } else {
            return Number.NaN;
        }
    }

    /**
     * Gets an option as a string. See `getOptionDefaultToProjectOptions(..)`.
     * @param defaultValue
     * @param {string} keys
     * @returns {string}
     */
    protected getOptionDefaultToProjectOptionsAsString(defaultValue: any, ...keys: string[]): string {
        const retVal: string = this.getOptionDefaultToProjectOptions(defaultValue, ...keys);
        if (retVal === undefined || retVal === null) {
            return retVal;
        } else {
            return retVal + "";
        }
    }

    /**
     * Returns an option from the webservice options, and if not available there, returns from the projectVars.
     *
     * @param {string} key
     * @returns {any}
     */
    protected getOptionDefaultToProjectOptions(defaultValue: any, ...keys: string[]): any {
        let val: any;
        for (const key of keys) {
            val = this.params.options.get(this.getPluginName() + ":" + key);
            if (val) {
                return val;
            }
        }

        for (const key of keys) {
            val = this.params.projectVars.get(key);
            if (val) {
                return val;
            }
        }

        // try all lowercase...only do this once we have checked case sensitive for performance reasons.
        const options: object = {};
        if (this.params.options) {
            for (const key in this.params.options.get(this.getPluginName())) {
                options[key.toLowerCase()] = this.params.options.get(this.getPluginName() + ":" + key);
            }
        }
        if (this.params.projectVars) {
            for (const key in this.params.projectVars.asObject()) {
                options[key.toLowerCase()] = this.params.projectVars.get(key);
            }
        }

        for (const key of keys) {
            val = options[key.toLowerCase()];
            if (val) {
                return val;
            }
        }

        return defaultValue;
    }

    /**
     * Writes the package.json in the dist folder.
     */
    protected writePackageJson(): void {
        if (this.params.type === ETaskType.build) {
            const newPackageJson = this.generatePackageJson();
            const packageJsonDestFile: string = path.resolve(this.params.config.jobOutDir, "dist", "package.json");
            mkdirp.sync(path.parse(packageJsonDestFile).dir);
            fs.writeFileSync(packageJsonDestFile, JSON.stringify(newPackageJson, null, 2), {encoding: "utf8"});
        }
    }

    protected generatePackageJson(): any {
        const projectPackageJson = this.params.config.repo.packageJson;

        const dependencies: _.Dictionary<string> = this.nodeExternals.versionsUsed;

        this.addExtraPackageJsonDependencies(dependencies);

        let command: string = "node ";
        const bundleOptions = this.getBundleOptions();
        if (bundleOptions.memorySize) {
            command += "--max-old-space-size=" + bundleOptions.memorySize + " ";
        }
        const startScriptName = this.getStartScriptName();
        command += "./" + startScriptName;

        let typingsFile: string;
        const entry = this.getEntry();
        const entryDefFile = entry.substring(0, entry.indexOf(".js")) + ".d.ts";
        if (fs.existsSync(entryDefFile)) {
            typingsFile = "typings" + path.sep + path.relative(this.params.taskOutDir, entryDefFile);
        }

        const newPackageJson: object = {
            name: this.params.config.project.slug,
            description: this.params.config.project.description,
            license: projectPackageJson.license,
            version: projectPackageJson.version,
            repository: projectPackageJson.repository,
            author: projectPackageJson.author,
            private: projectPackageJson.private,
            dependencies: dependencies,
            typings: typingsFile
        };

        const webpackOptions = this.getWebpackOptions();
        if (webpackOptions.otherPackageAdditions) {
            _.forEach(webpackOptions.otherPackageAdditions, (value: any, key: string) => {
                newPackageJson[key] = value;
            });
        }

        if (startScriptName) {
            // tslint:disable-next-line
            newPackageJson["scripts"] = {
                start: "better-npm-run start"
            };
            // tslint:disable-next-line
            newPackageJson["betterScripts"] = {
                start: {
                    command: command,
                    env: this.getEnvVariablesForProcess()
                }
            };
        }

        return newPackageJson;
    }

    /**
     * Adds extra dependencies for the package.json that will be generated.
     *
     * @param {_.Dictionary<string>} dependencies
     */
    protected addExtraPackageJsonDependencies(dependencies: _.Dictionary<string>): void {
        // add dependencies that are only available in StartWebService
        const rootDirOfHammerpack: string = path.resolve(__dirname, "..", "..", "..", "..");
        const hammerpackNodeExternals: NodeExternals = new NodeExternals(
            this.logger,
            JSON.parse(fs.readFileSync(path.resolve(rootDirOfHammerpack, "package.json"), "utf8")),
            rootDirOfHammerpack
        );

        this.addExtraDefaultPackageDependencies(dependencies, hammerpackNodeExternals);

        const extraNpmModules = this.getExtraNpmModules();
        if (_.isString(extraNpmModules) || _.isArray(extraNpmModules)) {
            _.forEach(extraNpmModules, (npmModule: string) => {
                dependencies[npmModule] =
                    this.getDependencyVersion(npmModule, this.nodeExternals, hammerpackNodeExternals);
            });
        } else {
            _.forEach(extraNpmModules, (npmVersion: string, npmModule: string) => {
                dependencies[npmModule] = npmVersion;
            });
        }
    }

    /**
     * Adds default package dependencies that may not be required in the code being bundled. Use this if you are
     * including a start script that needs dependencies.
     *
     * @param {_.Dictionary<string>} dependencies
     * @param {NodeExternals} hammerpackNodeExternals
     */
    protected addExtraDefaultPackageDependencies(
        dependencies: _.Dictionary<string>, hammerpackNodeExternals: NodeExternals): void {
        // tslint:disable
        dependencies["node-fetch"] =
            this.getDependencyVersion("node-fetch", this.nodeExternals, hammerpackNodeExternals);
        dependencies["async"] = this.getDependencyVersion("async", this.nodeExternals, hammerpackNodeExternals);
        dependencies["lodash"] = this.getDependencyVersion("lodash", this.nodeExternals, hammerpackNodeExternals);
        dependencies["better-npm-run"] =
            this.getDependencyVersion("better-npm-run", this.nodeExternals, hammerpackNodeExternals);
        dependencies["source-map-support"] =
            this.getDependencyVersion("source-map-support", this.nodeExternals, hammerpackNodeExternals);
        // tslint:enable
    }

    /**
     * Gets the dependency version for the given package from the given NodeExternals registry.
     *
     * @param {string} name
     * @param {NodeExternals} projectNodeExternals
     * @param {NodeExternals} hammerpackNodeExternals
     * @returns {string}
     */
    protected getDependencyVersion(
        name: string, projectNodeExternals: NodeExternals, hammerpackNodeExternals: NodeExternals): string {
        return projectNodeExternals.packageVersions[name] || hammerpackNodeExternals.packageVersions[name] || "*";
    }

    /**
     * Kills a process with the given port and calls callback.
     *
     * @param {number} port
     * @param {ErrorCallback<Error>} callback
     */
    protected killProcessWithPort(port: number, callback: async.ErrorCallback<Error>): void {
        findprocess("port", port)
            .then((items: object[]) => {
                if (!items || items.length === 0) {
                    callback();
                } else {
                    const fns: Array<async.AsyncVoidFunction<Error>> = _.map(
                        items, (item: any): async.AsyncVoidFunction<Error> => {
                            return (innerCallback: (err?: Error) => void) => {
                                this.killProcess(item.pid, (err: Error) => {
                                    // ignore error, we were just being careful by killing existing processes,
                                    // should not stop build.
                                    innerCallback();
                                });
                            };
                        });

                    async.parallel(fns, callback);
                }
            })
            .catch(callback);
    }

    /**
     * Kills the current process or the process that is currently running on specified `getPort(..)`
     * @param {ErrorCallback<Error>} callback
     */
    protected killCurrentProcess(callback: async.ErrorCallback<Error>): void {
        const port: number = this.getPort();
        if (this.runProcess) {
            this.killProcess(this.runProcess.pid, (err: Error) => {
                if (port) {
                    this.killProcessWithPort(port, callback);
                } else {
                    callback();
                }
            });
        } else if (port) {
            this.killProcessWithPort(port, callback);
        } else {
            callback();
        }
    }

    /**
     * Kills the process with the given pid and calls callback.
     *
     * @param {number} pid
     * @param {ErrorCallback<Error>} callback
     */
    protected killProcess(pid: number, callback: async.ErrorCallback<Error>): void {
        kill(pid, (err: Error) => {
            if (err) {
                // ignore the error, since we were just killing processes to be careful.
                callback();
                return;
            }

            // keep checking if the process has really died, then call callback
            let isDead: boolean = false;
            async.until((): boolean => {
                if (this.runProcess) {
                    psnode.lookup({pid: this.runProcess.pid}, (err: Error, result: Array<any>) => {
                        isDead = !result || result.length === 0;
                    });

                    return isDead;
                } else {
                    return true;
                }
            }, (noopCallback: async.ErrorCallback<Error>) => setTimeout(() => noopCallback(), 1000), callback);
        });
    }

    /**
     * Starts the server process.
     */
    protected startServerProcess(): void {
        if (!this.canRunProcess()) {
            return;
        }

        this.runProcess = null;

        const debugPort: number = this.getBundleOptions().debugPort || 5858;
        this.logger.info(`Starting server with debug port ${debugPort}...`);

        const args: string[] = [];

        if (semver.gte(process.version, "7.0.0")) {
            args.push("--inspect=" + debugPort);
        } else {
            args.push("--debug=" + debugPort);
        }

        if (this.getBundleOptions().memorySize) {
            args.push("--max-old-space-size=" + this.getBundleOptions().memorySize);
        }

        this.runProcess = fork(this.getStartScriptFilePath(), [], {
            cwd: path.resolve(this.params.config.jobOutDir, "dist"),
            execArgv: args,
            env: this.getEnvVariablesForProcess()
        });

        this.runProcess.on("close", () => this.runProcess = null);
        this.runProcess.on("disconnect", () => this.runProcess = null);
        this.runProcess.on("exit", () => this.runProcess = null);
    }

    onSigTerm = () => {
        this.killCurrentProcess(() => {
            process.exit(0);
        });
    }
}

export interface ISetLoadersParams {
    config: webpack.Configuration;
    useHotLoader: boolean;
    useExtractTextPlugin: boolean;
    ignoreCss: boolean;
    doNotIgnoreFileLoader: boolean;
    addSourceMaps: boolean;
}
