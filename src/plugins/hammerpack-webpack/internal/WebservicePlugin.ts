import _ = require("lodash");
import webpack = require("webpack");
import * as path from "path";
import * as fs from "fs";
import mkdirp = require("mkdirp");
import * as WebpackDevServer from "webpack-dev-server";
import webpackFailPlugin = require("webpack-fail-plugin");
import ExtractTextPlugin = require("extract-text-webpack-plugin");
import {AbstractWebpackPlugin} from "./AbstractWebpackPlugin";
import {ETaskType} from "../../../public/api/ETaskType";
import {ILogger} from "../../../public/api/ILogger";
import {Task} from "../../../internal/Task";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {startWebservice} from "./StartWebservice";
import {IWebpackBundleOptions} from "./IWebpackBundleOptions";
import {IWebserviceOptions} from "../configure/IWebserviceOptions";
import {IWebpackOptions} from "./IWebpackOptions";

export function createWebservicePlugin(params: Task, logger: ILogger): ITaskPluginInstance {
    return new WebservicePlugin(params, logger);
}

export class WebservicePlugin extends AbstractWebpackPlugin {
    options: IWebserviceOptions;
    initialStartupCompiledOnce: boolean = false;
    currentlyCompilingServer: boolean = false;
    currentlyCompilingClient: boolean = false;
    hotReloadWebpackServer: WebpackDevServer;
    serverWatch: webpack.Compiler.Watching;
    serverProgress: number;
    clientProgress: number;
    serverStats: webpack.Stats;
    clientStats: webpack.Stats;

    constructor(params: Task, logger: ILogger) {
        super(params, logger);
        this.options = params.options.get(this.getPluginName());
    }

    protected getPluginName(): string {
        return "webservice";
    }

    protected isCurrentlyCompiling(): boolean {
        return this.currentlyCompilingServer || this.currentlyCompilingClient;
    }

    protected preemptCompile(): boolean {
        // kill all existing stuff first.

        if (this.hotReloadWebpackServer) {
            try {
                this.hotReloadWebpackServer.close(() => {
                    this.hotReloadWebpackServer = null;
                    setTimeout(() => {
                        this.currentlyCompilingClient = false;
                    }, 0);
                });
                return true;
            } catch (e) {
                this.hotReloadWebpackServer = null;
            }
        }

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

        this.currentlyCompilingClient = true;
        this.currentlyCompilingServer = true;
        this.serverProgress = 0;
        this.clientProgress = 0;

        const clientCompiler: webpack.Compiler = webpack(this.generateClientWebpack());
        clientCompiler.plugin("done", (stats: any) => {
            this.clientStats = stats;
            this.startServerProcess(); // this will start the process if it was waiting for the client stats from before.
        });

        const serverCompiler: webpack.Compiler = webpack(
            this.generateServerWebpack(this.params.type === ETaskType.develop));

        serverCompiler.plugin("done", (stats: webpack.Stats) => {
            this.serverStats = stats;
        });

        if (this.params.type === ETaskType.develop) {
            this.hotReloadWebpackServer = new WebpackDevServer(clientCompiler, {
                https: this.getEnableHttps(),
                compress: true,
                hot: true,
                historyApiFallback: true,
                stats: "none",
                disableHostCheck: true,
                public: this.getHotReloadPublicUrl(),
                watchOptions: {
                    ignored: path.resolve(this.params.config.jobOutDir, "dist", "**") + "/"
                },
                headers: {"Access-Control-Allow-Origin": "*"}
            });

            this.hotReloadWebpackServer.listen(this.getHotReloadPort(), this.getHost(), (err: Error) => {
                if (err) {
                    this.logger.error(err);
                }
            });

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

            clientCompiler.run((err: Error, stats: webpack.Stats) => {
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

        if (!this.options.server || !this.options.server.entry) {
            throw new Error(this.getPluginName() + ":server:entry not defined");
        }

        config.entry = {
            "server.bundle": this.getEntry()
        };

        config.output = {
            filename: "[name].js",
            path: this.getDistDir(false),
            publicPath: isDevelop ? this.getHotReloadPublicUrl() : undefined,
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

    protected generateClientWebpack(): webpack.Configuration {
        const config: webpack.Configuration = {};
        config.name = "hot-reload-" + this.params.config.project.slug;
        config.target = "web";
        config.cache = true;
        config.externals = [
            this.nodeExternals.webpackExternalsWithBundling.bind(this.nodeExternals)
        ];

        if (!this.options.client || !this.options.client.entry) {
            throw new Error(this.getPluginName() + ":client:entry not defined");
        }

        const entry: string[] = [];
        const isDevelop: boolean = this.params.type === ETaskType.develop;

        if (isDevelop) {
            entry.push("react-hot-loader/patch");
            entry.push("webpack-dev-server/client?" + this.getHotReloadPublicUrl());
            entry.push("webpack/hot/only-dev-server");
        }

        entry.push(this.getClientEntry());

        config.entry = {
            "client.bundle": entry
        };

        let browserPath = this.getBrowserPath();
        if (browserPath && browserPath.length > 0) {
            browserPath = "/" + browserPath + "/";
        } else {
            browserPath = "/";
        }

        config.output = {
            filename: isDevelop ? "[name].js" : "[name].[chunkhash].js",
            path: this.getDistDir(true),
            publicPath: isDevelop ? this.getHotReloadPublicUrl() : browserPath,
        };

        this.setLoaders({
            config: config,
            ignoreCss: false,
            ignoreFileLoader: false,
            useExtractTextPlugin: !isDevelop,
            useHotLoader: true,
            addSourceMaps: isDevelop,
        });

        this.setResolve(config);

        const nodeModulesPath: string = path.resolve(this.params.config.repo.rootDirectoryPath, "node_modules");

        config.plugins = [
            new webpack.optimize.CommonsChunkPlugin({
                name: "vendors.bundle",
                minChunks: (module, count) => {
                    return module.resource && module.resource.startsWith(nodeModulesPath);
                }
            }),
            new webpack.ProgressPlugin(this.progressHandler("client").bind(this)),
            ...this.getHappyPackPlugins()
        ];

        if (isDevelop) {
            config.devtool = "eval-source-map";
        }

        if (isDevelop) {
            config.plugins.push(new webpack.HotModuleReplacementPlugin());
        } else {
            config.plugins.push(new webpack.NoEmitOnErrorsPlugin());
            config.plugins.push(new webpack.optimize.OccurrenceOrderPlugin(false));
            config.plugins.push(new webpack.optimize.UglifyJsPlugin({
                compress: {
                    warnings: false
                }
            }));

            config.plugins.push(new ExtractTextPlugin("[name].[hash].css", {allChunks: true}));
        }


        if (this.options.client.provide) {
            config.plugins.push(new webpack.ProvidePlugin(this.options.client.provide));
        }

        config.plugins.push(
            new webpack.DefinePlugin(this.stringifyDefinePlugin(this.getDefineObject(true, isDevelop))));

        config.plugins.push(webpackFailPlugin);


        return config;
    }

    protected getDefineObject(isClient: boolean, isDevelop: boolean) {
        const defineObj: object = this.options.client.define || {};
        const renderEnvValue: string = isClient ? "client" : "server";
        const nodeEnvValue: string = isDevelop ? "development" : "production";

        if (defineObj[PROCESS_ENV]) {
            defineObj[PROCESS_ENV][RENDER_ENV] = renderEnvValue;
            defineObj[PROCESS_ENV][NODE_ENV] = nodeEnvValue;
        } else if (defineObj[PROCESS]) {
            if (defineObj[PROCESS][ENV]) {
                defineObj[PROCESS][ENV][RENDER_ENV] = renderEnvValue;
                defineObj[PROCESS][ENV][NODE_ENV] = nodeEnvValue;
            } else {
                defineObj[PROCESS][ENV] = {
                    [RENDER_ENV]: renderEnvValue,
                    [NODE_ENV]: nodeEnvValue
                };
            }
        } else {
            defineObj[PROCESS_ENV] = {
                [RENDER_ENV]: renderEnvValue,
                [NODE_ENV]: nodeEnvValue
            };
        }
        return defineObj;
    }

    protected progressHandler(progressBarKey: string): (percentage: number, msg: string) => void {
        return (percentage: number, msg: string): void => {
            if (!this.somethingChanged) {
                // really weback, nothing has changed, why you run?
                return;
            }

            if (progressBarKey === "server") {
                this.serverProgress = percentage;

                // reset if we are starting over.
                if (percentage === 0) {
                    this.totalProgress = this.clientProgress;
                    this.currentlyCompilingServer = true;
                }
            } else {
                this.clientProgress = percentage;

                // reset if we are starting over.
                if (percentage === 0) {
                    this.totalProgress = this.serverProgress;
                    this.currentlyCompilingClient = true;
                }
            }

            const totalProgress: number = (this.serverProgress + this.clientProgress) / 2.0;
            if ((totalProgress - this.totalProgress >= 0.05) || (totalProgress === 1)) {
                this.logger.info("Webpack Progress: " + Math.floor(totalProgress * 100) + "%");
                this.totalProgress = totalProgress;
            }

            if (totalProgress >= 1) {
                this.totalProgress = 0;
                this.onDoneCompile();
            }
        };
    }

    /**
     * Called when the compilation is complete. Call this from the progress handler of webpack when it is at 100%.
     */
    protected onDoneCompile(): void {
        // hot reload webpack always compiles twice at startup for some odd reason.
        if (!this.initialStartupCompiledOnce && this.params.type === ETaskType.develop) {
            this.initialStartupCompiledOnce = true;
            return;
        }

        const wasCompilingServer = this.currentlyCompilingServer;
        const wasCompilingClient = this.currentlyCompilingClient;
        this.currentlyCompilingServer = false;
        this.currentlyCompilingClient = false;

        // the setTimeout here is so that the clientStats can be set using the webpack done plugin.
        setTimeout(() => {
            this.copyInterestingServerFiles(wasCompilingServer, (error: Error) => {

                if (error) {
                    this.logger.error(error);
                }

                if (this.currentlyCompilingServer || this.currentlyCompilingClient) {
                    // we got triggered again, so don't do anything, but reset the flags

                    if (!this.currentlyCompilingServer && wasCompilingServer) {
                        this.currentlyCompilingServer = true;
                    }
                    if (!this.currentlyCompilingClient && wasCompilingClient) {
                        this.currentlyCompilingClient = true;
                    }
                    return;
                }

                // interesting file got saved while we were compiling, so have to compile again.
                if (this.compileAgain) {
                    setTimeout(() => {
                        this.currentlyCompilingServer = false;
                        this.currentlyCompilingClient = false;
                        this.compile();
                    }, 0);

                    return;
                }

                this.somethingChanged = false;

                let compileError: Error;
                if (wasCompilingServer && this.serverStats) {
                    this.outputStats(this.serverStats);
                    if (this.serverStats.hasErrors()) {
                        compileError =
                            new Error("There was an error in Webpack compilation. See above for more details.");
                    }
                }

                if (wasCompilingClient && this.clientStats) {
                    this.outputStats(this.clientStats);
                    if (this.clientStats.hasErrors()) {
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


                if (wasCompilingServer && this.params.type === ETaskType.develop) {
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
        let clientStats: string;
        let serverStats: string;

        if (this.clientStats) {
            clientStats = this.clientStats.toJson(this.getStatsJsonOptions());
            if (this.params.type === ETaskType.develop) {
                this.logger.info(
                    `Webpack Hot-Reload Server for ${this.params.config.project.name} launched at ${this.getHotReloadPublicUrl()} in ${((this.clientStats as any).endTime -
                        (this.clientStats as any).startTime) / 1000}s.`);
            } else {
                this.logger.info(
                    `Client bundle for ${this.params.config.project.name} saved at ${this.getDistDir(
                        true)} in ${((this.clientStats as any).endTime -
                        (this.clientStats as any).startTime) / 1000}s.`);
            }
        }
        if (this.serverStats) {
            serverStats = this.serverStats.toJson(this.getStatsJsonOptions());
            this.logger.info(
                `Server bundle for ${this.params.config.project.name} saved at ${this.getDistDir(
                    false)} in ${((this.serverStats as any).endTime -
                    (this.serverStats as any).startTime) / 1000}s.`);
        }

        super.callResults(err, {
            serverStats: serverStats,
            clientStats: clientStats
        });
    }

    /**
     * Gets the browser public path.
     *
     * @returns {string}
     */
    protected getBrowserPath(): string {
        return _.trim(this.options.client.browserPath || "resources", "/");
    }

    /**
     * Gets the output directory for webpack.
     *
     * @param {boolean} forClient
     * @returns {string}
     */
    protected getDistDir(forClient: boolean = true): string {
        const dist: string = forClient ? path.resolve(this.params.config.jobOutDir, "dist", "resources") : path.resolve(
            this.params.config.jobOutDir, "dist");

        if (!fs.existsSync(dist)) {
            mkdirp.sync(path.parse(dist).dir);
        }

        return dist;
    }

    protected getStartScriptName(): string {
        return "start-webservice.js";
    }

    protected getClientEntry(): string {
        return this.normalizeEntry(this.options.client.entry);
    }

    protected getPublicUrl(): string {
        let defaultPublicUrl: string = (this.getEnableHttps() ? "https" : "http") + "://" + this.getHost();
        const port: number = this.getPort();
        if (port !== 80 && port !== 443) {
            defaultPublicUrl += ":" + port;
        }

        return this.getOptionDefaultToProjectOptionsAsString(
            defaultPublicUrl, "server:publicUrl", "publicUrl", "PUBLICURL", "PUBLIC_URL");
    }

    protected getHotReloadPublicUrl(): string {
        let defaultPublicUrl: string = (this.getEnableHttps() ? "https" : "http") + "://" + this.getHost();
        const port: number = this.getHotReloadPort();
        if (port !== 80 && port !== 443) {
            defaultPublicUrl += ":" + port;
        }

        return this.getOptionDefaultToProjectOptionsAsString(
            defaultPublicUrl, "server:hotreloadPublicUrl", "hotreloadPublicUrl", "HOTRELOADPUBLICURL",
            "HOTRELOAD_PUBLICURL", "HOTRELOAD_PUBLIC_URL", "HOT_RELOAD_PUBLIC_URL"
        );
    }

    protected getHotReloadPort(): number {
        const port: number = this.getPort() + 1;
        return this.getOptionDefaultToProjectOptionsAsNumber(
            port, "server:hotReloadPort", "hotReloadPort", "HOTRELOADPORT", "HOTRELOAD_PORT", "HOT_RELOAD_PORT");
    }

    protected getEnvVariablesForProcess(): object {
        const clientFiles: string[] = [];
        for (const chunk of (this.clientStats as any).compilation.entrypoints[CLIENT_BUNDLE].chunks) {
            for (const file of chunk.files) {
                clientFiles.push(file);
            }
        }

        return {
            HAMMERPACK_CLIENT_FILES: clientFiles.join(","),
            HAMMERPACK_HOTRELOAD_PUBLICURL: this.getHotReloadPublicUrl(),
            HAMMERPACK_VERSION: this.params.config.job.id,
            HAMMERPACK_ENABLE_HTTPS: this.getEnableHttps() + "",
            HAMMERPACK_TASK_TYPE: this.params.type,
            NODE_ENV: (this.params.type === ETaskType.develop) ? "development" : "production",
            RENDER_ENV: "server"
        };
    }

    protected getStartScriptContent(): string {
        return startWebservice;
    }

    protected getAliases(): _.Dictionary<string> {
        return this.options.alias;
    }

    protected getBundleOptions(): IWebpackBundleOptions {
        return this.options.server;
    }

    protected getWebpackOptions(): IWebpackOptions {
        return this.options;
    }

    protected canRunProcess(): boolean {
        return !!this.clientStats;
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

const PROCESS_ENV: string = "process.env";
const PROCESS: string = "process";
const ENV: string = "env";
const RENDER_ENV: string = "RENDER_ENV";
const NODE_ENV: string = "NODE_ENV";
const CLIENT_BUNDLE: string = "client.bundle";