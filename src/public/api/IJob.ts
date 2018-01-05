import {ITask} from "./ITask";
import {IConfig} from "./IConfig";

/**
 * A Job does something with a project, whether it be build, develop, test, deploy, etc.
 *
 * A Job has a unique ID that you and Hammerpack can refer to. Hammerpack also uses the Job ID for caching.
 */
export interface IJob {

    /**
     * Each job is composed of one or more Tasks.
     */
    tasks: Array<ITask>;

    /**
     * The ID of the job.
     */
    id: string;

    /**
     * The loaded configuration.
     */
    config: IConfig;
}