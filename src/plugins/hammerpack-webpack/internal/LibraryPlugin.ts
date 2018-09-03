import _ = require("lodash");
import webpack = require("webpack");
import mkdirp = require("mkdirp");
import webpackFailPlugin = require("webpack-fail-plugin");
import ExtractTextPlugin = require("extract-text-webpack-plugin");
import * as path from "path";
import * as fs from "fs";
import {AbstractWebpackPlugin} from "./AbstractWebpackPlugin";
import {ETaskType} from "../../../public/api/ETaskType";
import {ILogger} from "../../../public/api/ILogger";
import {Task} from "../../../internal/Task";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {IWebpackBundleOptions} from "./IWebpackBundleOptions";
import {ILibraryOptions} from "../configure/ILibraryOptions";
import {NodeExternals} from "./NodeExternals";
import {IWebpackOptions} from "./IWebpackOptions";
import {IPackageJson} from "../../../public/api/IPackageJson";

export function createLibraryPlugin(params: Task, logger: ILogger): ITaskPluginInstance {
    return new LibraryPlugin(params, logger);
}

export class LibraryPlugin extends AbstractWebpackPlugin {
    options: ILibraryOptions;
    currentlyCompiling: boolean = false;
    watch: webpack.Compiler.Watching;
    progress: number;
    stats: webpack.Stats;

    constructor(params: Task, logger: ILogger) {
        super(params, logger);
        this.options = params.options.get(this.getPluginName());
    }

    protected getPluginName(): string {
        return "library";
    }

    protected isCurrentlyCompiling(): boolean {
        return this.currentlyCompiling;
    }

    protected preemptCompile(): boolean {
        // kill all existing stuff first.

        if (this.watch) {
            try {
                this.watch.close(() => {
                    this.watch = null;
                    setTimeout(() => {
                        this.currentlyCompiling = false;
                    }, 0);
                });
                return true;
            } catch (e) {
                this.watch = null;
            }
        }

        return false;
    }

    protected doCompile(): void {

        this.currentlyCompiling = true;
        this.progress = 0;

        const compiler: webpack.Compiler = webpack(this.generateWebpack());

        compiler.plugin("done", (stats: webpack.Stats) => {
            this.stats = stats;
        });

        if (this.params.type === ETaskType.develop) {
            this.watch = compiler.watch({}, (err: Error, stats: webpack.Stats): void => {
                if (err) {
                    this.logger.error(err);
                }
            });
        } else {
            compiler.run((err: Error, stats: webpack.Stats) => {
                if (err) {
                    this.callResults(err);
                }
            });
        }
    }

    protected generateWebpack(): webpack.Configuration {
        const config: webpack.Configuration = {};
        config.name = this.params.config.project.slug;
        config.cache = true;
        config.externals = [
            this.nodeExternals.webpackExternalsWithoutBundling.bind(this.nodeExternals)
        ];

        if (!this.options || !this.options.entry) {
            throw new Error(this.getPluginName() + ":entry not defined");
        }

        const entry: string[] = [];
        const isDevelop: boolean = this.params.type === ETaskType.develop;

        entry.push(this.getEntry());

        if (!isDevelop) {
            config.entry = {
                [this.params.config.project.slug]: entry,
                [this.params.config.project.slug + ".min"]: entry,
            };
        } else {
            config.entry = {
                [this.params.config.project.slug]: entry
            };
        }

        let filename: string;
        if (this.options.bundleSuffix === "hash") {
            filename = "[name].[chunkhash].js";
        } else if (this.options.bundleSuffix === "rootPackageVersion") {
            const projectPackageJson: IPackageJson = this.params.config.repo.packageJson;
            if (projectPackageJson.version) {
                filename = "[name]." + projectPackageJson.version + ".js";
            } else {
                filename = "[name].js";
            }
        } else if (_.isString(this.options.bundleSuffix) && this.options.bundleSuffix !== "none") {
            filename = "[name]." + this.options.bundleSuffix + ".js";
        } else {
            // default is none
            filename = "[name].js";
        }

        config.output = {
            filename: filename,
            path: this.getDistDir(),
            library: this.params.config.project.slug,
            libraryTarget: "umd",
            umdNamedDefine: true
        };

        this.setLoaders({
            config: config,
            ignoreCss: false,
            doNotIgnoreFileLoader: false,
            useExtractTextPlugin: !isDevelop,
            useHotLoader: false,
            addSourceMaps: true,
        });

        this.setResolve(config);

        config.plugins = [
            new webpack.ProgressPlugin(this.progressHandler().bind(this)),
            ...this.getHappyPackPlugins()
        ];

        config.devtool = "source-map";

        if (!isDevelop) {
            config.plugins.push(new webpack.NoEmitOnErrorsPlugin());
            config.plugins.push(new webpack.optimize.OccurrenceOrderPlugin(false));
            config.plugins.push(new webpack.optimize.UglifyJsPlugin({
                include: this.params.config.project.slug + ".min",
                compress: {
                    warnings: false
                }
            }));

            config.plugins.push(new ExtractTextPlugin({filename: "[name].[contenthash].css", allChunks: true}));
        }


        if (this.options.provide) {
            config.plugins.push(new webpack.ProvidePlugin(this.options.provide));
        }

        config.plugins.push(webpackFailPlugin);

        config.target = "node";

        return config;
    }

    protected progressHandler(): (percentage: number, msg: string) => void {
        return (percentage: number, msg: string): void => {
            if (!this.somethingChanged) {
                // really weback, nothing has changed, why you run?
                return;
            }

            this.progress = percentage;

            // reset if we are starting over.
            if (percentage === 0) {
                this.totalProgress = 0;
                this.currentlyCompiling = true;
            }

            if ((this.progress - this.totalProgress >= 0.05) || (this.progress === 1)) {
                this.logger.info("Webpack Progress: " + Math.floor(this.progress * 100) + "%");
                this.totalProgress = this.progress;
            }

            if (this.progress >= 1) {
                this.totalProgress = 0;
                this.onDoneCompile();
            }
        };
    }

    /**
     * Called when the compilation is complete. Call this from the progress handler of webpack when it is at 100%.
     */
    protected onDoneCompile(): void {
        const wasCompiling = this.currentlyCompiling;
        this.currentlyCompiling = false;

        // the setTimeout here is so that the clientStats can be set using the webpack done plugin.
        setTimeout(() => {
            this.copyInterestingServerFiles(wasCompiling, (error: Error) => {

                if (error) {
                    this.logger.error(error);
                }

                if (this.currentlyCompiling) {
                    // we got triggered again, so don't do anything, but reset the flags

                    if (!this.currentlyCompiling && wasCompiling) {
                        this.currentlyCompiling = true;
                    }
                    return;
                }

                // interesting file got saved while we were compiling, so have to compile again.
                if (this.compileAgain) {
                    setTimeout(() => {
                        this.currentlyCompiling = false;
                        this.compile();
                    }, 0);

                    return;
                }

                this.somethingChanged = false;

                let compileError: Error;
                if (this.stats) {
                    this.outputStats(this.stats);
                    if (this.stats.hasErrors()) {
                        compileError =
                            new Error("There was an error in Webpack compilation. See above for more details.");
                    }
                }

                if (this.compileStartTime) {
                    const doneTime: number = Math.round((new Date().getTime() - this.compileStartTime) / 1000);
                    this.logger.info("Webpack has completed compiling " + this.params.config.project.name + " in " +
                        doneTime + "s.");

                    // reset the time. We only do this the first time we compile, not on webpack watch
                    this.compileStartTime = 0;

                    // finally, notify that we are done
                    this.notify("Webpack Done", "Webpack has completed compiling " + this.params.config.project.name +
                        " in " +
                        doneTime + "s.");
                } else {
                    this.logger.info("Webpack has completed compiling " + this.params.config.project.name);

                    // finally, notify that we are done
                    this.notify("Webpack Done", "Webpack has completed compiling " + this.params.config.project.name);
                }


                if (this.params.type !== ETaskType.develop) {
                    this.callResults(compileError);
                }

            });
        }, 0);
    }

    /**
     * Resets the results.
     *
     * @param {Error} err
     */
    protected callResults(err?: Error): void {
        let stats: string;

        if (this.stats) {
            stats = this.stats.toJson(this.getStatsJsonOptions());
            this.logger.info(
                `Library bundle for ${this.params.config.project.name} saved at ${this.getDistDir()} in ${((this.stats as any).endTime -
                    (this.stats as any).startTime) / 1000}s.`);
        }

        super.callResults(err, {
            stats: stats
        });
    }

    /**
     * Gets the output directory for webpack.
     *
     * @returns {string}
     */
    protected getDistDir(): string {
        const dist: string = path.resolve(this.params.config.jobOutDir, "dist");

        if (!fs.existsSync(dist)) {
            mkdirp.sync(path.parse(dist).dir);
        }

        return dist;
    }

    protected getStartScriptName(): string {
        return null;
    }

    protected getEntry(): string {
        return this.normalizeEntry(this.options.entry);
    }

    protected getEnvVariablesForProcess(): object {
        return null;
    }

    protected getStartScriptContent(): string {
        return null;
    }

    protected getAliases(): _.Dictionary<string> {
        return this.options.alias;
    }

    protected getBundleOptions(): IWebpackBundleOptions {
        return this.options;
    }

    protected getWebpackOptions(): IWebpackOptions {
        return this.options;
    }

    protected canRunProcess(): boolean {
        return false;
    }

    protected getExtraNpmModules(): string[] {
        if (this.options.extraNpmModules) {
            if (_.isString(this.options.extraNpmModules)) {
                return [this.options.extraNpmModules];
            } else {
                return this.options.extraNpmModules as string[];
            }
        } else {
            return [];
        }
    }

    protected addExtraDefaultPackageDependencies(
        dependencies: _.Dictionary<string>, hammerpackNodeExternals: NodeExternals) {
        // empty, since we don't have a script.
    }

    protected generatePackageJson(): any {
        const packageJson = super.generatePackageJson();
        const chunks: any[] = (this.stats as any).compilation.entrypoints[this.params.config.project.slug].chunks;
        if (chunks.length === 1) {
            packageJson.main = chunks[0].files[0];
        } else if (chunks.length > 1) {
            // the first one is vendors
            packageJson.main = chunks[1].files[0];
        }

        // use peer dependencies instead of dependencies.
        if (packageJson.dependencies) {
            const newDependencies: object = {};
            _.forEach(packageJson.dependencies, (version: string, dependency: string) => {
                if (Number.isNaN(parseInt(version.charAt(0), 10))) {
                    newDependencies[dependency] = version;
                } else {
                    newDependencies[dependency] = "^" + version;
                }
            });

            packageJson.dependencies = newDependencies;
        }

        // set the package version the same as the bundle suffix.
        if (this.options.bundleSuffix && this.options.bundleSuffix !== "rootPackageVersion" &&
            this.options.bundleSuffix !== "hash" &&
            this.options.bundleSuffix !== "none") {
            packageJson.version = this.options.bundleSuffix;
        }

        return packageJson;
    }
}

const PROCESS_ENV: string = "process.env";
const PROCESS: string = "process";
const ENV: string = "env";
const RENDER_ENV: string = "RENDER_ENV";
const NODE_ENV: string = "NODE_ENV";