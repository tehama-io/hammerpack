import * as async from "async";
import _ = require("lodash");
import cuid = require("cuid");
import {Task} from "./Task";
import {ETaskType} from "../public/api/ETaskType";
import {Config} from "./Config";
import {IPluginJobResult} from "../public/plugins/IPluginJobResult";
import {IJob} from "../public/api/IJob";

export class Job implements IJob {
    tasks: Array<Task> = [];
    id: string;
    config: Config;

    constructor(config: Config) {
        this.id = config.options.get("job:id") || cuid();

        const taskTypes: ETaskType[] = config.options.getAsArray("job:do");
        if (taskTypes.length === 0) {
            throw new Error("I don't know what to do. You need to define what task to run using job:do");
        }

        _.forEach(taskTypes, (taskType: ETaskType) => {
            this.tasks.push(new Task(taskType, config));
        });
    }

    build(callback: async.ErrorCallback<Error>): void {
        const fns: async.AsyncVoidFunction<Error>[] = _.map(this.tasks, (task: Task) => task.build.bind(task));
        async.parallel(fns, callback);
    }

    execute(callback: async.AsyncResultCallback<_.Dictionary<IPluginJobResult>, Error>): void {
        const fns: async.AsyncFunction<any, any>[] =
            _.map(this.tasks, (task: Task) => task.execute.bind(task));

        // if any of the tasks is a develop task, we add a 'forever' task at the end so that it keeps running...
        const developTask: Task = _.find(this.tasks, (task: Task) => {
            if (task.type === ETaskType.develop) {
                return task;
            } else {
                return null;
            }
        });

        if (developTask) {
            fns.push((callback: async.ErrorCallback<Error>) => {
                // don't call callback!
            });
        }

        async.series(fns, (err: Error, results: Array<_.Dictionary<IPluginJobResult>>) => {
            // merge the results
            const retVal: _.Dictionary<IPluginJobResult> = {};

            if (results) {
                _.forEach(results, (item: _.Dictionary<IPluginJobResult>) => {
                    _.forEach(item, (value: IPluginJobResult, key: string) => {
                        retVal[key] = value;
                    });
                });
            }

            callback(err, retVal);
        });
    }
}