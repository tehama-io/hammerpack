// tslint:disable-next-line
/// <reference types="jest"/>
// tslint:disable-next-line
///<reference path="./jest.d.ts"/>

import async = require("async");
import _ = require("lodash");
import {Task} from "../../../internal/Task";
import {ITaskPluginInstance} from "../../../public/plugins/ITaskPlugin";
import {ILogger} from "../../../public/api/ILogger";
import * as jest from "jest";

export function createJestPlugin(params: Task, logger: ILogger): ITaskPluginInstance {
    return new JestPlugin(params, logger);
}

class JestPlugin implements ITaskPluginInstance {
    params: Task;
    logger: ILogger;
    currentlyRunning: boolean = false;
    runAgain: boolean = false;

    constructor(params: Task, logger: ILogger) {
        this.params = params;
        this.logger = logger;
    }

    test(result: async.AsyncResultCallback<object, Error>): void {
        this.runTest(_.once(result));
    }

    private runTest(result?: async.AsyncResultCallback<object, Error>): void {
        if (this.currentlyRunning) {
            this.runAgain = true;
        } else {
            this.currentlyRunning = true;
            this.runAgain = false;

            const timestamp: number = new Date().getTime();

            jest.runCLI(_.extend({}, {
                rootDir: this.params.taskOutDir,
                _: this.params.taskOutDir,
            }, this.params.options.get("jest") || {}), ".")
                .then((retVal: object) => {
                    this.printOutput(retVal);
                    this.logger.info("Finished running tests in " + ((new Date().getTime() - timestamp) / 1000) + "s.");
                    result(null, JSON.parse(JSON.stringify(retVal)));
                }).catch(result);
        }
    }

    private printOutput(retVal): void {
        this.logger.info(JSON.stringify(retVal));
    }
}