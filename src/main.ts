#!/usr/bin/env node

import _ = require("lodash");
import async = require("async");
import yaml = require("js-yaml");
import yargs = require("yargs");
import fs = require("fs");
import path = require("path");
import nconf = require("nconf");
import uuid = require("uuid");
import {PathUtils} from "./public/utils/PathUtils";
import {Config} from "./internal/Config";
import {PluginManager} from "./internal/PluginManager";
import {IPluginJobResult} from "./public/plugins/IPluginJobResult";
import {SimpleStore} from "./internal/SimpleStore";
import {ErrorUtil} from "./public/utils/ErrorUtil";

// initialize default OOTB plugins.
PluginManager.initDefault();

export function catchUncaughtExceptions(): void {
    (process as NodeJS.EventEmitter).on("uncaughtException", function (thrown: any): void {
        let msg: string = "Unknown Error";
        if (thrown instanceof Error) {
            const error: Error = thrown as Error;
            msg = error.name + ": " + error.message + "\n" + error.stack;
        } else if (thrown) {
            msg = thrown.toString();
        }

        // tslint:disable-next-line
        console.error("Uncaught error:\n" + msg);
    });
}

export default class Hammerpack {
    private config: Config;

    static create(workingDirPath: string): Hammerpack {
        nconf.use("memory");
        return new Hammerpack(uuid.v4(), workingDirPath);
    }

    /**
     * Executes the job according to the job:type.
     *
     * Make sure you have loaded all configurations necessary using the load* functions before calling this function.
     *
     * @param {AsyncResultCallback<Object, Error>} callback
     */
    execute(callback: async.AsyncResultCallback<object, Error>): void {

        const fns: Array<async.AsyncFunction<any, Error>> = [];

        // build the configuration
        fns.push(this.config.build.bind(this.config));

        // execute the job
        fns.push(this.config.execute.bind(this.config));

        async.series(fns, (err: Error, result: object[]) => {
            // use the results we accumulated for each plugin execution
            const nconfResult: SimpleStore = new SimpleStore(this.config.options.namespace + "-result");
            _.forEach(result[1], (value: IPluginJobResult, key: string) => {
                nconfResult.set(key, value);
            });

            callback(err, nconf.get(this.config.options.namespace + "-result"));
        });
    }

    /**
     * Loads a configuration from process environment variables.
     *
     * @returns {Hammerpack}
     */
    loadProcessEnvVars(): Hammerpack {
        const args: object = yargs(process.argv.slice(2));
        this.loadObject(args);
        return this;
    }

    /**
     * Loads a configuration from a JSON file.
     *
     * @param {string} filePath
     * @param {string} encoding
     * @returns {Hammerpack}
     */
    loadJsonFile(filePath: string,
                 encoding: string = "utf8"): Hammerpack {
        filePath = PathUtils.getAsAbsolutePath(filePath, this.config.workingDir);
        const json: object = JSON.parse(fs.readFileSync(filePath, encoding).toString());
        this.loadObject(json);
        this.config.confFilePath = filePath;
        return this;
    }

    /**
     * Loads a configuration from a Yaml file.
     *
     * @param {string} filePath
     * @param {string} encoding
     * @returns {Hammerpack}
     */
    loadYamlFile(
        filePath: string,
        encoding: string = "utf8"): Hammerpack {
        filePath = PathUtils.getAsAbsolutePath(filePath, this.config.workingDir);
        const json: object = yaml.safeLoad(fs.readFileSync(filePath, encoding));
        this.loadObject(json);
        this.config.confFilePath = filePath;
        return this;
    }

    /**
     * Loads a configuration from an object.
     *
     * @param {object} conf
     * @returns {Hammerpack}
     */
    loadObject(
        conf: object): Hammerpack {
        _.forEach(conf, (value: object, key: string) => {
            this.config.options.set(key, value);
        });
        return this;
    }

    private constructor(namespace: string, workingDir: string) {
        this.config = new Config(namespace, workingDir);
    }
}

if (require.main === module) {
    // when called from command line, we load the environment variables first, then any configuration file that
    // is supplied, then the default conf file.
    let workingDir: string;

    // tslint:disable-next-line
    let confFilePath: string = yargs.argv["conf"];
    if (!confFilePath) {
        // check if there is a hammerpack.yaml file in the current working directory
        if (fs.existsSync(path.resolve(process.cwd(), "hammerpack.yaml"))) {
            confFilePath = path.resolve(process.cwd(), "hammerpack.yaml");
        }
    }

    if (!confFilePath) {
        confFilePath = PathUtils.searchForPath(process.cwd(), "hammerpack.yaml");

        // still can't find it
        if (!confFilePath) {
            throw new Error(
                "No configuration file provided or found. Please provide a configuration file using the --conf argument.");
        }
    }

    confFilePath = PathUtils.getAsAbsolutePath(confFilePath, process.cwd());
    workingDir = path.parse(confFilePath).dir;

    const hammerpack: Hammerpack = Hammerpack.create(workingDir).loadProcessEnvVars();
    const ext: string = path.parse(confFilePath).ext;
    if (ext === ".yaml") {
        hammerpack.loadYamlFile(confFilePath);
    } else {
        hammerpack.loadJsonFile(confFilePath);
    }

    hammerpack.execute((err: Error, result: _.Dictionary<IPluginJobResult>) => {
        // output only if there is something that needs to be executed.
        let hasSomething: boolean = false;
        _.forEach(result, (value: IPluginJobResult, key: string) => {
            if (value && (value.error || value.result)) {
                hasSomething = true;
                return false;
            }

            return true;
        });

        if (hasSomething) {
            // tslint:disable-next-line
            console.log(ErrorUtil.stringify(result));
        }

        if (err) {
            // tslint:disable-next-line
            console.error(err);
            process.exit(1);
        } else {
            process.exit();
        }
    });
}