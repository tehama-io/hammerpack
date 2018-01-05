import _ = require("lodash");
import async = require("async");

/**
 * Takes in either:
 *  1. a string in the format of: "a|b|c,d|e,f,g,h|i|j"
 *  2. a string array in the format of: ["a|b|c","d|e","f","g","h|i|j"]
 *
 * And executes the task in the given order. Each task divided by a pipe | is run in parallel to it's siblings,
 * and each set of parallel tasks divided by a comma is run in series.
 *
 * If a string is supplied, the parser will first split by comma, then by pipe. This means that you can have a series
 * of parallel tasks, but not a parallel of series tasks.
 *
 * Same goes for string[]: each item in the string[] represents a set of parallel tasks that will be run in series.
 */
export class AutoRunner {

    private name: string;
    private fns: _.Dictionary<async.AsyncFunction<any, Error>> = {};
    private runnerConfig: object = {};

    constructor(name: string) {
        this.name = name;
    }

    /**
     *
     * @param {string} key
     * @param {AsyncFunction<any, Error>} value
     * @returns {AutoRunner}
     */
    public add(key: string, value: async.AsyncFunction<any, Error>): AutoRunner {
        if (!key || !value) {
            throw new Error("Key and value must both be supplied to AutoRunner.");
        }
        this.fns[key] = function() {
            // we don't want any results propagating to every task.
            if (arguments.length > 1) {
                value(arguments[1]);
            } else {
                value(arguments[0]);
            }
        };
        return this;
    }

    /**
     * Parses a set of tasks. See class description for more information. Make sure you have added all the necessary
     * functions for each task using the add function. If you do not know what functions you want to add, then
     * call doParse with testMode=true and figure out what functions you want to add using the keys of the
     * runnerConfig in that function.
     *
     * @param {string | string[]} config
     * @returns {AutoRunner}
     */
    public parse(config: string | string[]): AutoRunner {
        if (!config || config.length === 0) {
            return this;
        }

        this.doParse(config, this.runnerConfig);

        return this;
    }

    /**
     * The only reason why this function is exposed is so that you can use testMode to figure out what the dependency
     * of tasks will look like before calling run().
     *
     * Otherwise, use parse(..) instead.
     *
     * @param {string | string[]} config
     * @param {Object} runnerConfig
     * @param {boolean} testMode
     */
    public doParse(config: string | string[], runnerConfig: object, testMode: boolean = false): void {
        let series: string[];
        if (_.isString(config)) {
            series = config.split(",");
        } else {
            series = config as string[];
        }

        let previous: any[] = [];
        let next: any[] = [];
        const tasks: string[] = [];

        // we only support one level of nesting (this is not a general purpose expression parser).
        for (const setOfParallelTasks of series) {
            if (!setOfParallelTasks) {
                continue;
            }

            const parallel: string[] = setOfParallelTasks.split("|");

            for (const task of parallel) {
                if (!task) {
                    continue;
                }

                const current = this.fns[task];
                if (!current && !testMode) {
                    throw new Error("Cannot find the function for " + task + " in " +
                        JSON.stringify(series));
                }

                tasks.push(task);
                runnerConfig[task] = previous.concat([current]);
                next.push(task);
            }

            previous = next;
            next = [];
        }
    }

    /**
     * Runs the tasks.
     *
     * @param {AsyncResultCallback<any[], Error>} callback
     */
    public run(callback: async.AsyncResultCallback<any[], Error>): void {
        if (!this.runnerConfig) {
            throw new Error("I don't know what to run for " + this.name + ".");
        }

        async.auto(this.runnerConfig, callback as any);
    }
}