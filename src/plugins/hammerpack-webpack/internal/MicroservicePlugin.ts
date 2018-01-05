import _ = require("lodash");
import webpack = require("webpack");
import * as path from "path";
import * as fs from "fs";
import mkdirp = require("mkdirp");
import webpackFailPlugin = require("webpack-fail-plugin");
import {AbstractWebpackPlugin} from "./AbstractWebpackPlugin";
import {ETaskType} from "../../../public/api/ETaskType";
import {ILogger} from "../../../public/api/ILogger";
import {Task} from "../../../internal/Task";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {startMicroservice} from "./StartMicroservice";
import {IMicroserviceOptions} from "../configure/IMicroserviceOptions";
import {IWebpackBundleOptions} from "./IWebpackBundleOptions";
import {IWebpackOptions} from "./IWebpackOptions";

export function createMicroservicePlugin(params: Task, logger: ILogger): ITaskPluginInstance {
    return new MicroservicePlugin(params, logger);
}

export class MicroservicePlugin extends AbstractWebpackPlugin {
    options: IMicroserviceOptions;
    currentlyCompilingServer: boolean = false;
    serverWatch: webpack.Compiler.Watching;
    serverProgress: number;
    serverStats: webpack.Stats;

    constructor(params: Task, logger: ILogger) {
        super(params, logger);
        this.options = params.options.get(this.getPluginName());
    }

    protected getPluginName(): string {
        return "microservice";
    }

    protected isCurrentlyCompiling(): boolean {
        return this.currentlyCompilingServer;
    }

    protected preemptCompile(): boolean {
        // kill all existing stuff first.

        if (this.serverWatch) {
            try {
                this.serverWatch.close(() => {
                    this.serverWatch = null;
                    setTimeout(() => {
                        this.currentlyCompilingServer = false;
                    }, 0);
                });
                return true;
            } catch (e) {
                this.serverWatch = null;
            }
        }

        return false;
    }

    protected doCompile(): void {

        this.currentlyCompilingServer = true;
        this.serverProgress = 0;

        const serverCompiler: webpack.Compiler = webpack(
            this.generateServerWebpack(this.params.type === ETaskType.develop));

        serverCompiler.plugin("done", (stats: webpack.Stats) => {
            this.serverStats = stats;
        });

        if (this.params.type === ETaskType.develop) {

            this.serverWatch = serverCompiler.watch({}, (err: Error, stats: webpack.Stats): void => {
                if (err) {
                    this.logger.error(err);
                }
            });

        } else {

            serverCompiler.run((err: Error, stats: webpack.Stats) => {
                if (err) {
                    this.callResults(err);
                }
            });

        }
    }

    protected generateServerWebpack(isDevelop: boolean): webpack.Configuration {
        const config: webpack.Configuration = {};
        config.name = this.params.config.project.slug;
        config.target = "node";
        config.cache = true;
        config.externals = [
            this.nodeExternals.webpackExternalsWithoutBundling.bind(this.nodeExternals),
            {
                "react-dom/server": true
            }
        ];

        if (!this.options || !this.options.entry) {
            throw new Error(this.getPluginName() + ":entry not defined");
        }

        config.entry = {
            "microservice.bundle": this.getEntry()
        };

        config.output = {
            filename: "[name].js",
            path: this.getDistDir(false),
            libraryTarget: "commonjs2"
        };

        this.setLoaders({
            config: config,
            addSourceMaps: true,
            useHotLoader: false,
            ignoreCss: true,
            ignoreFileLoader: true,
            useExtractTextPlugin: false
        });

        this.setResolve(config);

        config.devtool = "source-map";

        config.plugins = [
            new webpack.BannerPlugin(
                {banner: "require(\"source-map-support\").install();", raw: true, entryOnly: false}),

            new webpack.NoEmitOnErrorsPlugin(),
            new webpack.ProgressPlugin(this.progressHandler("server").bind(this)),

            ...this.getHappyPackPlugins(),

            webpackFailPlugin,
        ];

        return config;
    }

    protected progressHandler(progressBarKey: string): (percentage: number, msg: string) => void {
        return (percentage: number, msg: string): void => {
            if (!this.somethingChanged) {
                // really weback, nothing has changed, why you run?
                return;
            }

            this.serverProgress = percentage;

            // reset if we are starting over.
            if (percentage === 0) {
                this.totalProgress = 0;
                this.currentlyCompilingServer = true;
            }

            if ((this.serverProgress - this.totalProgress >= 0.05) || (this.serverProgress === 1)) {
                this.logger.info("Webpack Progress: " + Math.floor(this.serverProgress * 100) + "%");
                this.totalProgress = this.serverProgress;
            }

            if (this.serverProgress >= 1) {
                this.totalProgress = 0;
                this.onDoneCompile();
            }
        };
    }

    /**
     * Called when the compilation is complete. Call this from the progress handler of webpack when it is at 100%.
     */
    protected onDoneCompile(): void {
        const wasCompilingServer = this.currentlyCompilingServer;
        this.currentlyCompilingServer = false;


        setTimeout(() => {
            this.copyInterestingServerFiles(wasCompilingServer, (error: Error) => {

                if (error) {
                    this.logger.error(error);
                }

                if (this.currentlyCompilingServer) {
                    // we got triggered again, so don't do anything, but reset the flags

                    if (!this.currentlyCompilingServer && wasCompilingServer) {
                        this.currentlyCompilingServer = true;
                    }
                    return;
                }

                // interesting file got saved while we were compiling, so have to compile again.
                if (this.compileAgain) {
                    setTimeout(() => {
                        this.currentlyCompilingServer = false;
                        this.compile();
                    }, 0);

                    return;
                }

                this.somethingChanged = false;

                let compileError: Error;
                if (this.serverStats) {
                    this.outputStats(this.serverStats);
                    if (this.serverStats.hasErrors()) {
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


                if (this.params.type === ETaskType.develop) {
                    this.killCurrentProcess(_.once(() => {
                        this.queueRunProcess();
                        this.callResults(compileError);
                    }));
                } else {
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
        let serverStats: string;

        if (this.serverStats) {
            serverStats = this.serverStats.toJson(this.getStatsJsonOptions());
            this.logger.info(
                `Microservice bundle for ${this.params.config.project.name} saved at ${this.getDistDir(
                    false)} in ${((this.serverStats as any).endTime -
                    (this.serverStats as any).startTime) / 1000}s.`);
        }

        super.callResults(err, {
            serverStats: serverStats,
        });
    }

    /**
     * Gets the output directory for webpack.
     *
     * @param {boolean} forClient
     * @returns {string}
     */
    protected getDistDir(forClient: boolean = true): string {
        const dist: string = path.resolve(this.params.config.jobOutDir, "dist");

        if (!fs.existsSync(dist)) {
            mkdirp.sync(path.parse(dist).dir);
        }

        return dist;
    }

    protected getStartScriptName(): string {
        return "start-microservice.js";
    }

    protected getEnvVariablesForProcess(): object {
        return {
            HAMMERPACK_VERSION: this.params.config.job.id,
            HAMMERPACK_TASK_TYPE: this.params.type,
            NODE_ENV: (this.params.type === ETaskType.develop) ? "development" : "production",
        };
    }

    protected getStartScriptContent(): string {
        return startMicroservice;
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
        return true;
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
}
