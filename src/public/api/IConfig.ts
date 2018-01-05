import {ISimpleStore} from "./ISimpleStore";
import {IRepo} from "./IRepo";
import {IJob} from "./IJob";
import {IProject} from "./IProject";
import {ICache} from "../cache/ICache";

/**
 * Stores the configuration options that were supplied to Hammerpack, as well as other derived data.
 */
export interface IConfig {

    /**
     * Stores the supplied Hammerpack configuration options.
     */
    options: ISimpleStore;

    /**
     * This is the directory which we resolve all other relative directories with.
     */
    workingDir: string;

    /**
     * This is the directory that stores all of hammerpack job output.
     */
    hammerpackDir: string;

    /**
     * This is the directory where we output all of this job's results.
     */
    jobOutDir: string;

    /**
     * Where all the logs are stored.
     */
    logsFolder: string;

    /**
     * Information about the project's containing repo.
     */
    repo: IRepo;

    /**
     * Information about the job.
     */
    job: IJob;

    /**
     * Information about the project.
     */
    project: IProject;

    /**
     * Key-value cache to store all sorts of information for your task.
     */
    cache: ICache;
}