/**
 * Allows continuous compilation of typescript sources. Supports emit caching.
 */
import async = require("async");
import _ = require("lodash");
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import mkdirp = require("mkdirp");
import * as tslint from "tslint";
import anymatch = require("anymatch");
import {ITask} from "../../../public/api/ITask";
import {ITypescriptPluginOptions} from "../configure/ITypescriptPluginOptions";
import {PathUtils} from "../../../public/utils/PathUtils";
import {IFileCacheValue} from "../../../public/cache/IFileCacheValue";
import {CacheUtil} from "../../../public/cache/CacheUtil";
import {ErrorUtil} from "../../../public/utils/ErrorUtil";
import tsickle = require("tsickle");
import {TypescriptCancellationToken} from "./TypescriptCancellationToken";
import {ILogger} from "../../../public/api/ILogger";
import {IPluginCacheKey} from "../../../public/cache/IJobCacheKey";
import {ETaskType} from "../../../public/api/ETaskType";

/**
 */
export class TypescriptCompiler {

    private task: ITask;
    private logger: ILogger;
    private taskOptions: ITypescriptPluginOptions;
    private tsconfig: ts.CompilerOptions;
    private rootDir: string;
    private startFiles: string[];
    private readFile: (path: string, encoding?: string) => string | undefined;
    private writeFile: (path: string, data: string, writeByteOrderMark?: boolean) => void;
    private cacheUtil: CacheUtil;
    private workingDirName: string;
    private typescriptDestDir: string;
    private oldProgram: ts.Program;
    private tsickleHost: tsickle.TsickleHost;
    private compilerHost: ts.CompilerHost;
    private tslintConfig: tslint.Configuration.IConfigurationFile;
    private tslinter: tslint.Linter;

    private sourceFileCache: _.Dictionary<ISourceFileCache> = {};
    private dependencyGraph: _.Dictionary<IDependencyGraphNode> = {}; // dependencyGraph graph: filename vs
                                                                      // IDependencyGraphNode
    private prevErrorDiagnosticsFiles: _.Dictionary<true> = {};
    private prevCancelledAddedOrChangedFiles: _.Dictionary<true> = {};
    private prevCancelledRemovedFiles: _.Dictionary<true> = {};
    private outputClosureCompatible: boolean;

    constructor(
        task: ITask,
        logger: ILogger,
        readFile?: (path: string, encoding?: string) => string | undefined,
        writeFile?: (path: string, data: string, writeByteOrderMark?: boolean) => void,
        outputClosureCompatible: boolean = false) {
        this.task = task;
        this.logger = logger;
        this.taskOptions = task.options.get("typescript") || {};
        this.readFile = readFile || ts.sys.readFile;
        this.writeFile = writeFile || ts.sys.writeFile;
        this.cacheUtil = new CacheUtil(this.task.config.cache);
        this.workingDirName = path.parse(this.task.config.workingDir).name;
        this.typescriptDestDir = path.resolve(this.task.taskOutDir, this.workingDirName);
        this.outputClosureCompatible = outputClosureCompatible;
    }

    /**
     * Compiles the code. Make sure you do not call compile again on the same instance of TypescriptCompiler if
     * the previous call has not called callback yet.
     *
     * @param {(error?: Error, filesToWatch?: string[]) => void} callback
     * @param {TypescriptCancellationToken} cancellationToken
     * @param {string[]} addedOrChangedFiles
     * @param {string[]} removedFiles
     */
    compile(callback: (error?: Error, filesToWatch?: string[]) => void,
            cancellationToken: TypescriptCancellationToken,
            addedOrChangedFiles?: string[], removedFiles?: string[]): void {
        this.initialize();

        const filesToWatchDict: _.Dictionary<true> = {};
        const filesToRunDiagnosticsDict: _.Dictionary<true> = {};

        // first combine the previously cancelled files before we process them.
        if (addedOrChangedFiles) {
            addedOrChangedFiles.forEach((file: string) => this.prevCancelledAddedOrChangedFiles[file] = true);
            addedOrChangedFiles = _.keys(this.prevCancelledAddedOrChangedFiles);
        }
        if (removedFiles) {
            removedFiles.forEach((file: string) => this.prevCancelledRemovedFiles[file] = true);
            removedFiles = _.keys(this.prevCancelledRemovedFiles);
        }

        // we need to for sure run diagnostics on addedOrChangedFiles that are .ts or .tsx
        if (addedOrChangedFiles) {
            addedOrChangedFiles.forEach((filename: string) => {
                const ext: string = path.parse(filename).ext;
                if (ext === ".ts" || ext === ".tsx") {
                    filesToRunDiagnosticsDict[PathUtils.getAsAbsolutePath(
                        filename, this.task.config.repo.rootDirectoryPath)] = true;
                }
            });
        }

        const timestamp: number = new Date().getTime();

        // first remove all destination files that are from the removedFiles set.
        if (removedFiles && removedFiles.length > 0) {
            removedFiles.forEach((filename: string) => {
                const destFilePath: string = this.getDestFilePath(filename);
                if (destFilePath && fs.existsSync(destFilePath)) {
                    fs.unlinkSync(destFilePath);
                    delete this.sourceFileCache[filename];
                }

                const ext: string = path.parse(filename).ext;
                if (ext === ".ts" || ext === ".tsx") {
                    filesToRunDiagnosticsDict[PathUtils.getAsAbsolutePath(
                        filename, this.task.config.repo.rootDirectoryPath)] = true;
                }
            });

            const newTimestamp: number = new Date().getTime();
            this.logger.info("removal of files completed at " + ((newTimestamp - timestamp) / 1000) + "s.");
        }

        this.preCompileCheck(
            this.startFiles,
            cancellationToken, filesToWatchDict,
            (error?: Error, shouldCompile?: boolean, skipFiles?: _.Dictionary<true>): void => {

                let newTimestamp: number = new Date().getTime();
                this.logger.info("precompileCheck completed at " + ((newTimestamp - timestamp) / 1000) + "s.");

                this.compilerHost = ts.createCompilerHost(this.tsconfig);
                this.compilerHost.getSourceFile = this.getSourceFile.bind(this);
                this.compilerHost.getSourceFileByPath =
                    (
                        fileName: string, path: ts.Path, languageVersion: ts.ScriptTarget,
                        onError?: (message: string) => void): ts.SourceFile => {
                        return this.compilerHost.getSourceFile(fileName, languageVersion, onError);
                    };
                this.compilerHost.getCurrentDirectory = () => this.task.config.workingDir;

                const startFiles: string[] = this.getCompileFiles();
                this.oldProgram = ts.createProgram(
                    startFiles.concat(addedOrChangedFiles || []),
                    this.tsconfig, this.compilerHost, this.oldProgram
                );

                if (this.tslintConfig) {
                    this.tslinter = new tslint.Linter({fix: false}, this.oldProgram);
                }

                const sourceFiles: ts.SourceFile[] = this.oldProgram.getSourceFiles() as ts.SourceFile[];

                // tsickle converts the output from TS into a form consumable by Google Closure Compiler.
                // Still would need to run Closure Compiler separately though.
                if (this.outputClosureCompatible) {
                    this.tsickleHost = {
                        shouldSkipTsickleProcessing: (fileName) => false,
                        pathToModuleName: (context, importPath) => importPath,
                        shouldIgnoreWarningsForPath: (filePath) => true,
                        fileNameToModuleId: (fileName) => fileName,
                        es5Mode: true,
                        googmodule: true,
                        prelude: "",
                        transformDecorators: true,
                        transformTypesToClosure: true,
                        typeBlackListPaths: new Set(),
                        untyped: false,
                        logWarning: (warning: any) => this.logger.warn(warning)
                    };
                }

                newTimestamp = new Date().getTime();
                this.logger.info("createProgram completed at " + ((newTimestamp - timestamp) / 1000) + "s.");

                if (error) {
                    callback(error, _.keys(filesToWatchDict));
                    return;
                } else if (shouldCompile) {

                    const fns: Array<async.AsyncVoidFunction<Error>> = sourceFiles.map((sourceFile) =>
                        (innerCallback: async.ErrorCallback<Error>) => {
                            this.emit(
                                sourceFile, skipFiles, filesToWatchDict, innerCallback,
                                cancellationToken,
                            );
                        }
                    );

                    async.parallel(
                        fns,
                        (error: Error) => {
                            newTimestamp = new Date().getTime();
                            this.logger.info("emit completed at " + ((newTimestamp - timestamp) / 1000) + "s.");

                            // the errors from the fns above are quite catastrophic such that we don't supply a
                            // list of files to watch. This is because any error thrown during async.parallel may
                            // not complete other jobs.
                            if (error) {
                                callback(error);
                                return;
                            }

                            this.completeCompile(
                                filesToWatchDict, filesToRunDiagnosticsDict,
                                sourceFiles, callback, cancellationToken
                            );
                        }
                    );

                } else {
                    this.completeCompile(
                        filesToWatchDict, filesToRunDiagnosticsDict,
                        sourceFiles, callback, cancellationToken
                    );
                }
            }
        );
    }

    private completeCompile(
        filesToWatchDict: _.Dictionary<any>,
        filesToRunDiagnosticsDict: _.Dictionary<any>,
        sourceFiles: ts.SourceFile[],
        callback: (error?: Error, filesToWatch?: string[]) => void,
        cancellationToken: TypescriptCancellationToken): void {

        // first check if we already have existing results for this set of files.
        sourceFiles.sort((a: ts.SourceFile, b: ts.SourceFile) => {
            if (a && b) {
                return a.fileName.localeCompare(b.fileName);
            } else if (a && !b) {
                return -1;
            } else if (!a && b) {
                return 1;
            } else {
                return 0;
            }
        });

        let allSource: string = "";
        _.forEach(sourceFiles, (sourceFile: ts.SourceFile) => {
            allSource += sourceFile.getText(sourceFile);
            filesToWatchDict[sourceFile.fileName] = true;
        });

        allSource = ts.sys.createHash(allSource);
        const compilationCacheKey: IPluginCacheKey = {
            pluginName: "typescript",
            key: "compilationResult:" + allSource
        };

        this.cacheUtil.getPlugin(compilationCacheKey, (error: Error, value: any) => {
            if (error) {
                this.logger.warn(ErrorUtil.customize(
                    error,
                    "There was an error retrieving the compilation results for typescript from the cache."
                ));
            }

            let prevDiagnostics: IDiagnosticResult;

            if (value) {
                // whaddya know, we already have this.
                try {
                    prevDiagnostics = JSON.parse(value);
                } catch (e) {
                    // whaddya know, we don't. Let's remove this as it is likely a corrupt result.
                    this.logger.warn(
                        ErrorUtil.customize(e, "Could not parse the compilation result from typescript cache."));
                    this.cacheUtil.setPlugin(compilationCacheKey, null, _.noop);
                }
            }

            // we run the diagnostics
            // run diagnostics
            this.runDiagnostics(
                filesToRunDiagnosticsDict, sourceFiles,
                filesToWatchDict, cancellationToken, prevDiagnostics,
                (error: any, diagnosticResult: IDiagnosticResult) => {
                    if (diagnosticResult &&
                        (!diagnosticResult.diagnostics || diagnosticResult.diagnostics.length === 0) &&
                        (!diagnosticResult.tslintResult || diagnosticResult.tslintResult.errorCount === 0)) {
                        // clear the added, changed and removed files for next time.
                        this.prevCancelledAddedOrChangedFiles = {};
                        this.prevCancelledRemovedFiles = {};
                    }

                    let tslintError: Error;
                    if (diagnosticResult && diagnosticResult.tslintResult) {
                        if (diagnosticResult.tslintResult.errorCount > 0) {
                            tslintError = new Error(diagnosticResult.tslintResult.output);
                        } else if (diagnosticResult.tslintResult.warningCount > 0) {
                            // just the log the errors
                            this.logger.warn(diagnosticResult.tslintResult.output);
                        }
                    }

                    const diagnosticsError: Error =
                        this.maybeThrowError(diagnosticResult ? diagnosticResult.diagnostics : [], true)
                        || tslintError || error;

                    if (this.task.type === ETaskType.develop) {
                        // don't throw an error during development so that the process can continue running.
                        callback(null, _.keys(filesToWatchDict));

                        if (diagnosticsError) {
                            this.logger.error(diagnosticsError);
                        }
                    } else {
                        callback(diagnosticsError, _.keys(filesToWatchDict));
                    }

                    if (diagnosticsError) {
                        // if there was any error, we do not want to write the results because caching diagnostics
                        // is not only cumbersome (huge result, circular references in ts.Diagnostic[]), but also
                        // because we have in-memory state in TypescriptCompiler.
                        this.cacheUtil.flushWrites((error: Error) => {
                            if (error) {
                                this.logger.warn(
                                    ErrorUtil.customize(error, "An error occurred while flushing the cache."));
                            }
                        });
                    } else {
                        this.cacheUtil.setPlugin(compilationCacheKey, JSON.stringify(diagnosticResult || []),
                            (error: Error) => {
                                if (error) {
                                    this.logger.warn(ErrorUtil.customize(
                                        error,
                                        "An error occurred while saving typescript compilation results to cache."
                                    ));
                                }

                                this.cacheUtil.flushWrites((error: Error) => {
                                    if (error) {
                                        this.logger.warn(
                                            ErrorUtil.customize(error, "An error occurred while flushing the cache."));
                                    }
                                });
                            }
                        );
                    }
                }
            );
        });
    }

    private runDiagnostics(
        filesToRunDiagnosticsDict: _.Dictionary<true>,
        sourceFiles: ts.SourceFile[], filesToWatchDict: _.Dictionary<true>,
        cancellationToken: TypescriptCancellationToken,
        prevDiagnostics: IDiagnosticResult,
        callback: async.AsyncResultCallback<IDiagnosticResult, any>): void {

        sourceFiles.forEach((sourceFile) => {
            filesToWatchDict[sourceFile.fileName] = true;
            this.setDependants(sourceFile);
        });

        _.forEach(this.prevErrorDiagnosticsFiles, (value: true, key: string) => {
            filesToRunDiagnosticsDict[key] = true;
        });

        this.prevErrorDiagnosticsFiles = {};
        const filesToRunTslintDict: _.Dictionary<true> = filesToRunDiagnosticsDict;

        try {
            filesToRunDiagnosticsDict = this.walkUpDependantsChain(filesToRunDiagnosticsDict, cancellationToken);
        } catch (e) {
            callback(e);
            return;
        }

        const filesToRunDiagnostics: string[] = _.keys(filesToRunDiagnosticsDict);

        let diagnostics: ts.Diagnostic[] = [];

        if (prevDiagnostics) {
            callback(null, prevDiagnostics);

            return;
        }

        if (filesToRunDiagnostics && filesToRunDiagnostics.length > 0) {
            // if we are compiling at reaction to a watch event...
            let filesToRunDiagnosticsIndex: number = 0;
            async.whilst((): boolean => filesToRunDiagnosticsIndex < filesToRunDiagnostics.length,
                (innerCallback: async.ErrorCallback<any>) => {
                    setTimeout(() => {
                        if (cancellationToken.isCancellationRequested()) {
                            innerCallback(new ts.OperationCanceledException());
                            return;
                        }

                        const key: string = filesToRunDiagnostics[filesToRunDiagnosticsIndex];
                        const sourceFileCache: ISourceFileCache = this.sourceFileCache[key];
                        if (sourceFileCache && sourceFileCache.sourceFile) {
                            // for some reason, Typescript caches the cancellationToken on subsequent incremental compilation
                            // calls. For this reason, we cannot supply the cancellationToken to typescript.
                            const currentFileDiagnostics: ts.Diagnostic[] = []
                                .concat(this.oldProgram.getSyntacticDiagnostics(
                                    sourceFileCache.sourceFile/*, cancellationToken*/))
                                .concat(this.oldProgram.getSemanticDiagnostics(
                                    sourceFileCache.sourceFile/*, cancellationToken*/));

                            if (currentFileDiagnostics.length > 0) {
                                this.prevErrorDiagnosticsFiles[key] = true;
                            }

                            diagnostics = diagnostics.concat(currentFileDiagnostics);
                        }

                        filesToRunDiagnosticsIndex++;

                        innerCallback();
                    }, 0);
                }, (error: any) => {
                    if (error) {
                        callback(error);
                        return;
                    }

                    diagnostics =
                        diagnostics.concat(this.oldProgram.getGlobalDiagnostics(/*cancellationToken*/) as ts.Diagnostic[]);

                    callback(null, {
                        diagnostics: diagnostics,
                        tslintResult: this.lint(filesToRunTslintDict)
                    });
                });
        } else {
            if (cancellationToken.isCancellationRequested()) {
                callback(new ts.OperationCanceledException());
                return;
            }

            // compile everything
            // Note: do not supply a cancellation token here because this is the first time compile and we do not
            // want to screw up the first time compile because we don't have the full list of files to do a subsequent
            // incremental compile
            const everythingDiagnostics: ts.Diagnostic[] = []
                .concat(this.oldProgram.getSyntacticDiagnostics(
                    null/*, cancellationToken*/))
                .concat(this.oldProgram.getSemanticDiagnostics(
                    null/*, cancellationToken*/));

            everythingDiagnostics.forEach((diagnostic: ts.Diagnostic) => {
                this.prevErrorDiagnosticsFiles[diagnostic.file.fileName] = true;
            });

            diagnostics = diagnostics.concat(everythingDiagnostics);

            diagnostics =
                diagnostics.concat(this.oldProgram.getGlobalDiagnostics(/*cancellationToken*/) as ts.Diagnostic[]);

            callback(null, {
                diagnostics: diagnostics,
                tslintResult: this.lint(filesToWatchDict)
            });
        }
    }

    private lint(filesToLint: _.Dictionary<true>): tslint.LintResult {
        let tslintResult: tslint.LintResult;
        if (this.tslinter) {
            _.forEach(filesToLint, (value: true, filepath: string) => {
                if (filepath.startsWith(this.rootDir) && !filepath.endsWith(".d.ts") && this.sourceFileCache[filepath]) {
                    const source: string = this.readFile(filepath, "utf8");
                    this.tslinter.lint(filepath, source, this.tslintConfig);
                }
            });

            tslintResult = this.tslinter.getResult();

            // dispose of the tslinter once we are done
            this.tslinter = null;
        }

        return tslintResult;
    }

    private walkUpDependantsChain(
        base: _.Dictionary<true>, cancellationToken: TypescriptCancellationToken): _.Dictionary<true> {
        let index: number = 0;
        // the files we will want to go through and get dependants for. This list dynamically increases as we add
        // more files we want to get dependants for.

        const files: string[] = [];

        // this map is to keep track of what has already been processed so we don't go through it's dependants.
        const alreadyProcessed: _.Dictionary<true> = {};

        // this map is just used to ensure the files[] above stays unique. It's an optimization so that we don't
        // even add something to the list to go through. The optimization hits before alreadyProcessed.
        const willBeProcessed: _.Dictionary<true> = {};

        _.forEach(base, (value: true, file: string) => {
            files.push(file);
            willBeProcessed[file] = true;
        });

        while (index < files.length) {
            if (cancellationToken.isCancellationRequested()) {
                throw new ts.OperationCanceledException();
            }

            const current: string = files[index];

            if (alreadyProcessed[current]) {
                continue;
            }

            alreadyProcessed[current] = true;

            const node: IDependencyGraphNode = this.dependencyGraph[current];
            if (node) {
                _.forEach(node.dependants, (value: true, dependant: string) => {
                    if (!willBeProcessed[dependant]) {
                        willBeProcessed[dependant] = true;
                        files.push(dependant);
                    }
                });
            }

            index++;
        }

        return alreadyProcessed;
    }

    private emit(
        sourceFile: ts.SourceFile,
        skipFiles: _.Dictionary<true>,
        filesToWatchDict: _.Dictionary<true>,
        innerCallback: (error?: Error) => void,
        cancellationToken: TypescriptCancellationToken): void {

        if (skipFiles[sourceFile.fileName] || sourceFile.fileName.endsWith(".d.ts")) {
            // 1. return immediately if we are skipping this file.
            // 2. return immediately if it is a definition file. Currently, we do not process the type definition files.
            innerCallback(null);
            return;
        }

        // just in case typescript compiler gave us back sources that have duplicates.
        skipFiles[sourceFile.fileName] = true;

        const destFilePathStr: string = this.getDestFilePath(sourceFile.fileName);

        const relativeFilename: string = path.relative(
            this.task.config.repo.rootDirectoryPath,
            sourceFile.fileName
        );

        const hash = ts.sys.createHash(this.readFile(sourceFile.fileName));
        this.setDependants(sourceFile, hash);

        this.cacheUtil.getFile({
            filename: relativeFilename,
            hash: hash
        }, (error: Error, value: IFileCacheValue) => {

            if (value && value.transformedText !== undefined && value.transformedText !== null) {
                // destination file is different than the one we want to save...
                try {
                    if (!cancellationToken.isCanceled &&
                        (!fs.existsSync(destFilePathStr) ||
                            value.transformedText !== this.readFile(destFilePathStr))) {
                        this.writeFile(destFilePathStr, value.transformedText);
                        if (value.mapText) {
                            this.writeFile(destFilePathStr + ".map", value.mapText);
                        }
                        if (value.definitionText) {
                            this.writeFile(this.getDestDefinitionFilePath(sourceFile.fileName), value.definitionText);
                        }
                    }
                } catch (e) {
                    innerCallback(e);
                    return;
                }

                if (value.dependencies) {
                    value.dependencies.forEach((dependency) =>
                        filesToWatchDict[PathUtils.getAsAbsolutePath(
                            dependency, this.task.config.repo.rootDirectoryPath)] = true);
                }

                const dependencyNode: IDependencyGraphNode = this.dependencyGraph[sourceFile.fileName];
                if (dependencyNode) {
                    _.forEach(dependencyNode.dependants, (value: true, dependant: string) => {
                        filesToWatchDict[dependant] = true;
                    });
                }

                innerCallback(null);
            } else {
                let transformedText: string;
                let mapText: string;
                let defText: string;

                let emitResult: ts.EmitResult;

                if (this.outputClosureCompatible) {
                    emitResult = tsickle.emitWithTsickle(
                        this.oldProgram,
                        this.tsickleHost,
                        this.compilerHost,
                        this.tsconfig,
                        sourceFile,
                        (
                            fileName: string, data: string, writeByteOrderMark: boolean,
                            onError?: (message: string) => void, sourceFiles?: ReadonlyArray<ts.SourceFile>): void => {

                            this.writeFile(fileName, data, writeByteOrderMark);

                            if (fileName.endsWith(".map")) {
                                mapText = data;
                            } else if (fileName.endsWith(".d.ts")) {
                                defText = data;
                            } else {
                                transformedText = data;
                            }
                        }
                    );
                } else {
                    emitResult = this.oldProgram.emit(
                        sourceFile,
                        (
                            fileName: string, data: string, writeByteOrderMark: boolean,
                            onError?: (message: string) => void, sourceFiles?: ReadonlyArray<ts.SourceFile>): void => {

                            this.writeFile(fileName, data, writeByteOrderMark);

                            if (fileName.endsWith(".map")) {
                                mapText = data;
                            } else if (fileName.endsWith(".d.ts")) {
                                defText = data;
                            } else {
                                transformedText = data;
                            }
                        }
                    );
                }

                const emitError: Error = this.maybeThrowError(emitResult ? emitResult.diagnostics as ts.Diagnostic[] : [], true);
                if (emitError) {
                    innerCallback(emitError);
                    return;
                }

                let dependencies: string[];
                if (value) {
                    dependencies = value.dependencies;
                } else {
                    const dependencyGraphNode: IDependencyGraphNode = this.dependencyGraph[sourceFile.fileName];
                    if (dependencyGraphNode && dependencyGraphNode.dependencies) {
                        dependencies = _.keys(dependencyGraphNode.dependencies);
                    } else {
                        const imports: IImports = this.gatherAllImports(sourceFile);
                        dependencies = imports.srcFiles;
                    }
                }

                if (dependencies) {
                    // Watch all imports.
                    // these may reference files that are deleted: we still want to watch
                    // deleted files at case they come back.
                    dependencies.forEach((dependency) =>
                        filesToWatchDict[PathUtils.getAsAbsolutePath(
                            dependency, this.task.config.repo.rootDirectoryPath)] = true);
                }

                const dependencyNode: IDependencyGraphNode = this.dependencyGraph[sourceFile.fileName];
                if (dependencyNode) {
                    _.forEach(dependencyNode.dependants, (value: true, dependant: string) => {
                        filesToWatchDict[dependant] = true;
                    });
                }

                // save this result at our cache.

                this.cacheUtil.setFile({
                    filename: relativeFilename,
                    hash: hash
                }, {
                    transformedText: transformedText,
                    mapText: mapText,
                    definitionText: defText,
                    dependencies: dependencies,
                }, (error: Error) => {
                    if (error) {
                        this.logger.warn(ErrorUtil.customize(
                            error,
                            "An error occurred while trying to save the output of file " +
                            sourceFile.fileName +
                            " into the cache."
                        ));
                    }

                    innerCallback(null);
                });
            }
        });
    }

    private initialize(): void {
        // first load the tsconfig.json file.

        let configPath: string = this.taskOptions["tsconfig-json"];
        if (!configPath) {
            configPath = PathUtils.searchForPath(this.task.config.workingDir, "tsconfig.json");
        }

        if (configPath) {
            configPath = PathUtils.getAsAbsolutePath(configPath, this.task.config.workingDir);
            const configPathDir: string = path.parse(configPath).dir;

            const readConfig: {
                config?: any;
                error?: ts.Diagnostic;
            } = ts.readConfigFile(configPath, this.readFile);

            this.maybeThrowError(readConfig.error);

            const compilerOptions: {
                options: ts.CompilerOptions;
                errors: ts.Diagnostic[];
            } = ts.convertCompilerOptionsFromJson(readConfig.config.compilerOptions, configPathDir);

            this.maybeThrowError(compilerOptions.errors);

            this.tsconfig = compilerOptions.options;

            if (!this.tsconfig.rootDir) {
                this.tsconfig.rootDir = this.task.config.repo.rootSrcDirectoryPath || this.task.config.repo.rootDirectoryPath;
            }

            this.rootDir = PathUtils.getAsAbsolutePath(this.tsconfig.rootDir, configPathDir);
        } else {
            this.logger.warn("tsconfig.json not found. Using default compiler options.");

            this.tsconfig = ts.getDefaultCompilerOptions();

            this.tsconfig.rootDir =
                this.task.config.repo.rootSrcDirectoryPath || this.task.config.repo.rootDirectoryPath;
            this.rootDir = this.tsconfig.rootDir;
        }

        // modify the output according to where we have to output all this task's stuff.
        this.tsconfig.outDir = this.task.taskOutDir;
        this.tsconfig.baseUrl = this.task.config.workingDir;

        // skipLibCheck to make hammerpack easy to adopt. Otherwise, it is just asking for trouble.
        // TODO: maybe add this as an option?
        this.tsconfig.skipLibCheck = true;

        if (this.outputClosureCompatible) {
            // do not respect the removeComments setting because closure compiler requires comments
            this.tsconfig.removeComments = false;
        }

        // now figure out the start files
        // we will figure out the files to compile for the application and any test files if there are any so that we don't have
        // to compile everything over again for the test stage specifically.
        let startFiles: string[] = this.getCompileFiles();
        if (!startFiles || startFiles.length === 0) {
            // search for a start file
            _.forEach(DEFAULT_START_FILE_NAMES, (filename: string) => {
                const filepath: string = PathUtils.getAsAbsolutePath(filename, this.task.config.workingDir);
                if (fs.existsSync(filepath)) {
                    startFiles = [filepath];
                    return false;
                }

                return true;
            });
        }

        if (!startFiles || startFiles.length === 0) {
            throw new Error("No start file specified. Also, none of these files exist: " +
                DEFAULT_START_FILE_NAMES.join(", ") + " at the directory " + this.task.config.workingDir);
        }

        this.startFiles = _.map(startFiles, (startFile: string) =>
            PathUtils.getAsAbsolutePath(startFile, this.task.config.workingDir)
        );

        const tslintJsonParam: string = this.taskOptions["tslint-config-file"];
        if ((tslintJsonParam + "") !== "false") { // if it is explicitly false, then we disable tslint
            const tslintConfigJson: string = PathUtils.getAsAbsolutePath(tslintJsonParam ||
                path.resolve(this.task.config.repo.rootDirectoryPath, "tslint.json"), this.task.config.workingDir);
            const configLoadResult = tslint.Configuration.findConfiguration(tslintConfigJson, this.startFiles[0]);
            if (configLoadResult && configLoadResult.results) {
                this.tslintConfig = configLoadResult.results;
            }
        }
    }

    /**
     * Checks whether the original contents are the same as the last time we compiled.
     *
     * @param {(error?: Error, shouldCompile?: boolean) => void} callback
     */
    private preCompileCheck(
        startFiles: string[],
        cancellationToken: TypescriptCancellationToken,
        filesToWatchDict: _.Dictionary<true>,
        callback: (error?: Error, shouldCompile?: boolean,
                   skipFiles?: _.Dictionary<true>) => void): void {

        const alreadyProcessedSrcFiles: _.Dictionary<true> = {};
        const fns: Array<async.AsyncFunction<IShouldCompileResult[], Error>> = [];

        _.forEach(startFiles, (filepath: string) => {
            fns.push((innerCallback: (error: Error, result: IShouldCompileResult[]) => void) => {
                if (cancellationToken.isCancellationRequested()) {
                    innerCallback(TypescriptCancellationToken.cancellationError, []);
                    return;
                }

                this.recursivePreCompileCheck(
                    filepath, alreadyProcessedSrcFiles, filesToWatchDict, cancellationToken, innerCallback);
            });
        });

        async.parallel(fns, (err: Error, innerResult: Array<IShouldCompileResult[]>) => {
            if (cancellationToken.isCancellationRequested()) {
                callback(TypescriptCancellationToken.cancellationError);
                return;
            }

            if (err) {
                callback(err);
                return;
            }

            let shouldCompile: boolean = false;
            let callbackCalled: boolean = false;
            const skipFiles: _.Dictionary<true> = {};

            _.forEach(innerResult, (innerInnerResult: IShouldCompileResult[]) => {
                if (callbackCalled) {
                    return false;
                }

                _.forEach(innerInnerResult, (innerInnerInnerResult: IShouldCompileResult) => {
                    if (cancellationToken.isCancellationRequested()) {
                        callback(TypescriptCancellationToken.cancellationError);
                        callbackCalled = true;
                        return false;
                    }

                    if (callbackCalled) {
                        return false;
                    }

                    if (innerInnerInnerResult.shouldCompile) {
                        shouldCompile = true;
                    } else {
                        skipFiles[innerInnerInnerResult.srcFile] = true;
                    }

                    // write the file as necessary
                    if (innerInnerInnerResult.destFileToWrite && innerInnerInnerResult.destFileContents) {
                        // first make sure the directory exists...

                        const destDir: string = path.parse(innerInnerInnerResult.destFileToWrite).dir;

                        try {
                            mkdirp.sync(destDir);
                            this.writeFile(
                                innerInnerInnerResult.destFileToWrite, innerInnerInnerResult.destFileContents);

                            if (innerInnerInnerResult.mapFileContents) {
                                this.writeFile(
                                    innerInnerInnerResult.destFileToWrite + ".map",
                                    innerInnerInnerResult.mapFileContents
                                );
                            }

                            if (innerInnerInnerResult.defFileContents) {
                                this.writeFile(
                                    this.getDefinitionFilePath(innerInnerInnerResult.destFileToWrite),
                                    innerInnerInnerResult.defFileContents
                                );
                            }
                        } catch (e) {
                            callback(e);
                            callbackCalled = true;
                            return false;
                        }
                    }

                    return true;
                });

                return true;
            });

            if (!callbackCalled) {
                callback(null, shouldCompile, skipFiles);
            }
        });
    }

    private recursivePreCompileCheck(
        filepath: string,
        alreadyProcessedSrcFiles: _.Dictionary<true>,
        filesToWatchDict: _.Dictionary<true>,
        cancellationToken: TypescriptCancellationToken,
        callback: (error?: Error, result?: IShouldCompileResult[]) => void): void {

        if (!filepath || alreadyProcessedSrcFiles[filepath] || !fs.existsSync(filepath)) {
            callback(null, []);
            return;
        }

        filesToWatchDict[filepath] = true;

        if (cancellationToken.isCancellationRequested()) {
            callback(TypescriptCancellationToken.cancellationError, []);
            return;
        }

        alreadyProcessedSrcFiles[filepath] = true;

        const parsedPath: path.ParsedPath = path.parse(filepath);
        if (parsedPath.ext !== ".ts" && parsedPath.ext !== ".tsx") {
            return;
        }

        let fileContents: string;
        let hash: string;
        try {
            fileContents = this.readFile(filepath, "utf8");
            hash = ts.sys.createHash(fileContents);
        } catch (e) {
            callback(
                ErrorUtil.customize(e, "An error occurred while trying to create a hash for file " + filepath), []);
            return;
        }

        this.cacheUtil.getFile({
            filename: path.relative(this.task.config.repo.rootDirectoryPath, filepath),
            hash: hash
        }, (err: Error, value: IFileCacheValue) => {
            if (cancellationToken.isCancellationRequested()) {
                callback(TypescriptCancellationToken.cancellationError, []);
                return;
            }

            if (!value || value.transformedText === undefined || value.transformedText === null) { // don't check for empty string
                callback(null, [
                    {
                        shouldCompile: true,
                        srcFile: filepath
                    }
                ]);
            } else {
                // now read the destination path and check if it is the same...
                const destFilePath: string = this.getDestFilePath(filepath);
                let destFileContents: string;
                const result: IShouldCompileResult[] = [];

                if (fs.existsSync(destFilePath)) {
                    destFileContents = this.readFile(destFilePath);

                    if (destFileContents !== value.transformedText) {
                        result.push({
                            shouldCompile: false,
                            srcFile: filepath,
                            destFileToWrite: destFilePath,
                            destFileContents: value.transformedText,
                            mapFileContents: value.mapText,
                            defFileContents: value.definitionText
                        });
                    } else {
                        result.push({
                            shouldCompile: false,
                            srcFile: filepath
                        });
                    }
                } else {
                    result.push({
                        shouldCompile: false,
                        srcFile: filepath,
                        destFileToWrite: destFilePath,
                        destFileContents: value.transformedText,
                        mapFileContents: value.mapText,
                        defFileContents: value.definitionText
                    });
                }

                if (value.dependencies && value.dependencies.length > 0) {
                    const fns: Array<async.AsyncFunction<IShouldCompileResult[], Error>> = [];

                    _.forEach(value.dependencies, (dependencyRelativePath: string) => {
                        // dependency relative paths are always relative to the root directory.
                        const dependencyPath: string = PathUtils.getAsAbsolutePath(
                            dependencyRelativePath, this.task.config.repo.rootDirectoryPath);

                        if (!alreadyProcessedSrcFiles[dependencyPath]) {
                            fns.push((innerCallback: (error: Error, result: IShouldCompileResult[]) => void) => {
                                this.recursivePreCompileCheck(
                                    dependencyPath,
                                    alreadyProcessedSrcFiles,
                                    filesToWatchDict,
                                    cancellationToken,
                                    innerCallback
                                );
                            });
                        }
                    });

                    if (fns.length > 0) {
                        async.parallel(fns, (err: Error, innerResult: Array<IShouldCompileResult[]>) => {
                            if (cancellationToken.isCancellationRequested()) {
                                callback(TypescriptCancellationToken.cancellationError, []);
                                return;
                            }

                            if (err) {
                                callback(err);
                                return;
                            }

                            _.forEach(innerResult, (innerInnerResult: IShouldCompileResult[]) =>
                                _.forEach(innerInnerResult, (innerInnerInnerResult: IShouldCompileResult) =>
                                    result.push(innerInnerInnerResult)
                                )
                            );

                            callback(null, result);
                        });
                    } else {
                        callback(null, result);
                    }
                } else {
                    callback(null, result);
                }
            }
        });
    }

    /**
     * Gets a TS source file from in-memory cache if possible, otherwise creates it.
     *
     * @param {string} fileName
     * @param {ts.ScriptTarget} languageVersion
     * @param {(message: string) => void} onError
     * @returns {ts.SourceFile}
     */
    private getSourceFile(
        fileName: string, languageVersion: ts.ScriptTarget,
        onError?: (message: string) => void): ts.SourceFile {

        try {
            fileName = PathUtils.getAsAbsolutePath(fileName, this.task.config.workingDir);
            let hash: string;

            let sourceCache = this.sourceFileCache[fileName];
            if (sourceCache) {
                const content: string = this.readFile(fileName, "utf8");
                hash = ts.sys.createHash(content);

                if (sourceCache.hash !== hash) {
                    const sourceFile: ts.SourceFile = ts.createSourceFile(fileName, content, languageVersion);
                    sourceCache = {
                        sourceFile: sourceFile,
                        hash: hash
                    };
                    this.sourceFileCache[fileName] = sourceCache;
                }
            } else {
                const content: string = this.readFile(fileName, "utf8");
                const sourceFile: ts.SourceFile = ts.createSourceFile(fileName, content, languageVersion);
                hash = ts.sys.createHash(content);

                sourceCache = {
                    sourceFile: sourceFile,
                    hash: hash
                };
                this.sourceFileCache[fileName] = sourceCache;
            }

            return sourceCache.sourceFile;
        } catch (e) {
            if (onError) {
                onError(`Cannot get source file for ${fileName} because of ${(e || "").toString()}`);
            }
            return null;
        }
    }

    private setDependants(sourceFile: ts.SourceFile, hash?: string): void {
        if (sourceFile.fileName.endsWith(".d.ts")) {
            // ignore .d.ts files
            return;
        }

        hash = hash || ts.sys.createHash(this.readFile(sourceFile.fileName));

        const node: IDependencyGraphNode = this.dependencyGraph[sourceFile.fileName];
        if (!node || node.lastChecked !== hash) {

            if (node && node.lastChecked !== hash && node.dependencies) {
                // remove all the existing dependants first
                _.forEach(node.dependencies, (value: true, dependency: string) => {
                    const dependencyNode: IDependencyGraphNode = this.dependencyGraph[dependency];
                    if (dependencyNode && dependencyNode.dependants) {
                        delete dependencyNode.dependants[sourceFile.fileName];
                    }
                });
            }

            try {
                this.gatherAllImports(sourceFile);
            } catch (e) {
                if (e instanceof DependencyError) {
                    throw e;
                } else {
                    // we haven't compiled the program yet so most likely this is why we are getting an exception
                    // so just ignore for now, we can come back to it later.
                    this.logger.error(e);
                }
            }
        }
    }

    private getDestFilePath(srcFilePath: string): string {
        // first we get the root dir...preference given to the tsconfig defined root directory cuz that's what the
        // compiler will be using.
        const retPath: path.ParsedPath = path.parse(path.resolve(PathUtils.getAsAbsolutePath(
            path.relative(this.rootDir, srcFilePath), this.task.taskOutDir)));
        let retDestPath: string;
        if (this.tsconfig.jsx === ts.JsxEmit.Preserve && retPath.ext === ".tsx") {
            retDestPath = path.format({
                base: retPath.base.replace(".tsx", ".jsx"),
                root: retPath.root,
                name: retPath.name,
                dir: retPath.dir,
                ext: ".jsx"
            });
        } else {
            retDestPath = path.format({
                base: retPath.base.replace(".tsx", ".js").replace(".ts", ".js"),
                root: retPath.root,
                name: retPath.name,
                dir: retPath.dir,
                ext: ".js"
            });
        }

        this.task.addSourceToDestFileMapping(srcFilePath, retDestPath);

        return retDestPath;
    }

    private getDestDefinitionFilePath(srcFilePath: string): string {
        // first we get the root dir...preference given to the tsconfig defined root directory cuz that's what the
        // compiler will be using.
        const retPath: string = path.resolve(PathUtils.getAsAbsolutePath(
            path.relative(this.rootDir, srcFilePath), this.task.taskOutDir));
        const retDestPath: string = this.getDefinitionFilePath(retPath);

        this.task.addSourceToDestFileMapping(srcFilePath, retDestPath);

        return retDestPath;
    }

    private getDefinitionFilePath(srcFilePath: string): string {
        const parsedPath: path.ParsedPath = path.parse(srcFilePath);
        if (parsedPath.base.endsWith(".ts") && !parsedPath.base.endsWith(".d.ts")) {
            parsedPath.base = parsedPath.base.replace(".ts", ".d.ts");
        } else if (parsedPath.base.endsWith(".js")) {
            parsedPath.base = parsedPath.base.replace(".js", ".d.ts");
        } else if (parsedPath.base.endsWith(".tsx")) {
            parsedPath.base = parsedPath.base.replace(".tsx", ".d.ts");
        }

        return path.format({
            base: parsedPath.base,
            root: parsedPath.root,
            name: parsedPath.name,
            dir: parsedPath.dir,
            ext: ".d.ts"
        });
    }

    private maybeThrowError(allDiagnostics: ts.Diagnostic | ts.Diagnostic[], dontThrow: boolean = false): Error {
        if (!allDiagnostics) {
            return null;
        } else if (_.isArray(allDiagnostics)) {
            if (allDiagnostics.length === 0) {
                return null;
            }
        } else {
            allDiagnostics = [allDiagnostics];
        }

        const messages: string[] = [];

        allDiagnostics.forEach((diagnostic: ts.Diagnostic) => {
            if (diagnostic.file) {
                const {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
                messages.push(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
            } else {
                messages.push(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
            }
        });

        const error: Error = new Error("Compilation Error. \n\n" + messages.join("\n\n"));
        if (!dontThrow) {
            throw error;
        } else {
            return error;
        }
    }

    private gatherAllImports(sourceFile: ts.SourceFile): IImports {
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

        const ret: IImports = {
            packages: [],
            srcFiles: [],
            nonSrcFiles: []
        };

        if (sourceFile.fileName.endsWith(".d.ts")) {
            return ret;
        }

        walkNode(sourceFile);

        _.forEach(imports, (importedFile: string) => {
            if (importedFile.startsWith("\"") || importedFile.startsWith("\'")) {
                try {
                    importedFile = JSON.parse(importedFile);
                } catch (e) {
                    this.logger.warn("Don't know how to import module '" + importedFile + "' at file " +
                        sourceFile.fileName);
                    return;
                }
            }

            if (importedFile.startsWith(".")) {
                // this is a relative file path
                let absSrcFilePath: string =
                    path.resolve(PathUtils.getAsAbsolutePath(importedFile, path.parse(sourceFile.fileName).dir));

                let srcFilePath: string = path.relative(
                    this.task.config.repo.rootDirectoryPath,
                    absSrcFilePath
                );

                if (fs.existsSync(absSrcFilePath) && fs.statSync(absSrcFilePath).isDirectory()) {
                    // if we are importing a directory, it means we have to look for an index.ts or an index.tsx in there
                    srcFilePath += path.sep + "index";
                    absSrcFilePath += path.sep + "index";
                }

                // check if this file can be imported according to project dependencies
                // it's okay if the import is within the same project...
                let found: boolean = absSrcFilePath.startsWith(this.task.config.project.directory);
                if (!found) {
                    for (const dependency of this.task.config.project.dependencies) {
                        if (absSrcFilePath.startsWith(dependency)) {
                            found = true;
                            break;
                        }
                    }
                }

                if (!found) {
                    throw new DependencyError("The project " + this.task.config.project.name + " cannot depend on " + srcFilePath + " because it is not defined under the project's dependencies.");
                }

                if (!srcFilePath.endsWith(".ts") && fs.existsSync(absSrcFilePath + ".ts")) {
                    srcFilePath += ".ts";
                    ret.srcFiles.push(
                        srcFilePath
                    );
                } else if (!srcFilePath.endsWith(".tsx") && fs.existsSync(absSrcFilePath + ".tsx")) {
                    srcFilePath += ".tsx";
                    ret.srcFiles.push(
                        srcFilePath
                    );
                } else {
                    // does this file even exist?
                    if (fs.existsSync(absSrcFilePath)) {
                        ret.nonSrcFiles.push(
                            srcFilePath
                        );
                    } else {
                        // this is likely a file that is not yet added. Going to add both variations to track
                        ret.srcFiles.push(
                            srcFilePath + ".ts"
                        );
                        ret.srcFiles.push(
                            srcFilePath + ".tsx"
                        );
                    }
                }
            } else {
                const maybePackagePath: string = path.resolve(
                    this.task.config.repo.rootDirectoryPath, "node_modules",
                    importedFile.indexOf(path.sep) > 0 ? importedFile.substring(0, importedFile.indexOf(path.sep))
                        : importedFile
                );

                if (fs.existsSync(maybePackagePath)) {
                    ret.packages.push(path.relative(this.task.config.repo.rootDirectoryPath, maybePackagePath));
                } else {
                    // check if the file exists at the same file dir
                    let maybeSrcFilePath: string = path.resolve(PathUtils.getAsAbsolutePath(
                        importedFile, path.parse(sourceFile.fileName).dir));

                    if (!maybeSrcFilePath.endsWith(".ts") && fs.existsSync(maybeSrcFilePath + ".ts")) {
                        maybeSrcFilePath += ".ts";
                        ret.srcFiles.push(path.relative(this.task.config.repo.rootDirectoryPath, maybeSrcFilePath));
                    } else if (!maybeSrcFilePath.endsWith(".tsx") && fs.existsSync(maybeSrcFilePath + ".tsx")) {
                        maybeSrcFilePath += ".tsx";
                        ret.srcFiles.push(path.relative(this.task.config.repo.rootDirectoryPath, maybeSrcFilePath));
                    } else {
                        // ignore
                    }
                }
            }
        });

        let currentFileNode: IDependencyGraphNode = this.dependencyGraph[sourceFile.fileName];
        if (!currentFileNode) {
            currentFileNode = {
                lastChecked: ts.sys.createHash(sourceFile.text),
                dependencies: {},
                dependants: {}
            };
            this.dependencyGraph[sourceFile.fileName] = currentFileNode;
        } else {
            currentFileNode.dependencies = {};
            currentFileNode.lastChecked = ts.sys.createHash(sourceFile.text);
        }

        ret.srcFiles.forEach((dependancy: string) => {
            const absolutePath: string =
                PathUtils.getAsAbsolutePath(dependancy, this.task.config.repo.rootDirectoryPath);

            currentFileNode.dependencies[absolutePath] = true;

            let dependencyNode: IDependencyGraphNode = this.dependencyGraph[absolutePath];

            if (!dependencyNode) {
                dependencyNode = {
                    lastChecked: null,
                    dependencies: null,
                    dependants: {}
                };
                this.dependencyGraph[absolutePath] = dependencyNode;
            }

            dependencyNode.dependants[sourceFile.fileName] = true;
        });

        return ret;
    }

    private getCompileFiles(): string[] {
        const compileFiles: string[] = this.task.options.getAsArray("typescript:compile-files") || [];
        const transformedCompileFiles: string[] = [];
        for (const file of compileFiles) {
            const path = PathUtils.getAsAbsolutePath(file, this.task.config.project.directory);
            transformedCompileFiles.push(path);
        }

        const retVal: _.Dictionary<true> = {};
        this.doFindCompileFiles(transformedCompileFiles, this.task.config.project.directory, retVal);

        return _.keys(retVal);
    }

    private doFindCompileFiles(compileFiles: string[], dir: string, foundFiles: _.Dictionary<true>): void {
        const contents = fs.readdirSync(dir);
        _.forEach(contents, (content) => {
            const fileOrDir = path.resolve(dir, content);
            const stats = fs.statSync(fileOrDir);
            if (stats.isDirectory()) {
                this.doFindCompileFiles(compileFiles, fileOrDir, foundFiles);
            } else if (stats.isFile() && (fileOrDir.endsWith(".ts") || fileOrDir.endsWith(".tsx"))) {
                // check if it matches any of the compile files
                for (const compileFile of compileFiles) {
                    if (anymatch(compileFile, fileOrDir)) {
                        foundFiles[fileOrDir] = true;
                    }
                }
            }
        });
    }
}

const DEFAULT_START_FILE_NAMES: string[] = [
    "index.ts",
    "index.tsx",
    "main.ts",
    "main.tsx",
    "start.ts",
    "start.tsx",
    "root.ts",
    "root.tsx"
];

interface IShouldCompileResult {
    shouldCompile: boolean;
    srcFile: string;
    destFileToWrite?: string;
    destFileContents?: string;
    mapFileContents?: string;
    defFileContents?: string;
}

interface ISourceFileCache {
    sourceFile: ts.SourceFile;
    hash: string;
}

interface IImports {
    packages: string[];
    srcFiles: string[];
    nonSrcFiles: string[];
}

interface IDependencyGraphNode {
    // hash of contents of the file
    lastChecked: string;
    dependencies: _.Dictionary<true>;
    dependants: _.Dictionary<true>;
}

interface IDiagnosticResult {
    diagnostics: ts.Diagnostic[];
    tslintResult: tslint.LintResult;
}

// tslint:disable-next-line
class DependencyError extends Error {
    // nothing
}