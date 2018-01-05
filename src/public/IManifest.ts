import {ETaskType} from "./api/ETaskType";
import {IBaseJobOptions} from "./options/IBaseJobOptions";

/**
 * Configuration options that contain instructions on description of the job, project, repo, and for Hammerpack itself.
 */
export interface IManifest {

    /**
     * Options that configure the Hammerpack system.
     */
    system?: {
        /**
         * A list of Hammerpack plugin node modules that you want to use with this configuration.
         *
         * These should be the names of the modules that you have in the node_modules folder.
         *
         * Each of these plugin modules will load a 'plugin' that will be available at a particular configuration path.
         *
         * For example, the hammerpack-apiservice plugin module will add the following plugins:
         * - develop:apiservice
         * - build:apiservice
         * - run:apiservice
         *
         * Note that you do *not* need to specify the plugins that get shipped with Hammerpack here.
         */
        pluginModules?: string[];

        /**
         * Hammerpack maintains a cache of intermediate data so that subsequent jobs can be run faster. This cache can be
         * configured so that it is shared between multiple jobs running on multiple machines.
         *
         * You can use various available cache plugins. Each plugin will have its own setting so please refer to the
         * plugin's docs of what to put here.
         *
         * In order to use this, you can either supply a string with the name of the cache plugin, or you can use an
         * object where the key is the name of the plugin and the value is the options you want to supply to that
         * plugin.
         *
         * Default: RocksDB.
         */
        cache?: string|_.Dictionary<object>;
    };

    /**
     * A Job does something with a project, whether it be build, develop, test, deploy, etc.
     *
     * A Job has a unique ID that you and Hammerpack can refer to. Hammerpack also uses the Job ID for caching.
     */
    job?: {

        /** If you are running multiple jobs across projects, you may want to consider
         * specifying the ID as an environment variable (JOB:ID=123) or in the command line
         * (--job:id 123). This will ensure output across all jobs for the different projects
         * goes into the same output folder and the build artifacts get tagged the same.
         *
         * Default: an id will be randomly generated.
         */
        id?: string;

        /**
         * A job can be of different types? Values: develop, test, build, deploy, run.
         *
         * Note 1: both develop and run will 'execute' your project, but develop will execute non-optimized code with
         * extra debugging, hot-reloading, etc. Whereas run will execute production-ready build code. Also, if run does
         * not find the build code, the build job will be executed first.
         *
         * Note 2: you can either provide this here and have separate yaml files for each job type (develop, test,
         * build, deploy, run), or you can supply this parameter as a command line argument `--job:type develop` and
         * define settings for each type in the same file.
         *
         * Note 3: if you specify an array, Hammerpack will execute each of those jobs in the given order.
         */
        do?: ETaskType | Array<ETaskType>;
    };

    /**
     * The Project is some component of your system that you want to develop, test, build, deploy, run...
     */
    project: {

        /**
         * The name of the project will be used in various places such as for build:output_directory
         * It will be slugified in case it contains characters that cannot be used for
         * directory/file names or URLs. Note that the name of the project must be unique
         * in the repo.
         */
        name: string;

        /**
         * The description of the project. This will be used in the generated
         * package.json file in the output folder.
         */
        description?: string;

        /**
         * The names of any other project that this project depends on.
         *
         * During compilation (develop or build), if Hammerpack finds any resources required outside of the projects listed
         * here, it will throw an error.
         *
         * Not specifying a value here effectively means the project is free to depend on any and all other projects
         * in the repo.
         */
        dependencies?: string|string[];

    };

    /**
     * Repo is the monolithic repo that contains this Project as well as other Projects.
     */
    repo?: {
        /**
         * The root folder of the project which contains all services.
         * This is where we will find the root package.json file, yarn lock file,
         * tsconfig.json, tslint.json. Also, under the root directory, Hammerpack will create
         * the build output directory, cache directory, etc.
         * If this value is not specified, Hammerpack will try to detect the root directory by
         * walking up the parent directories from the working directory until it finds
         * a package.json file.
         */
        "root-directory"?: string;

        /**
         * Specifies the root directory of source files. Only use this to control the output directory.
         *
         * E.g.:
         * root-src-directory: ${repo:root-directory}/src/
         *
         * Means that, if an asset exists at ${repo:root-directory}/src/assets/myasset.jpg, then it will be output at
         * ${output directory}/assets/myasset.jpg. That is, the src folder will be skipped.
         *
         * This option is similar to Typescript's rootDir.
         *
         * Default: ${repo:root-directory}
         */
        "root-src-directory"?: string;

        /**
         * Override where Hammerpack should pick up the package.json file from.
         * Typically, Hammerpack suggests you have one root package.json shared amongst all
         * the projects that you want to build. This will ensure all dependencies,
         * are consistent throughout. However, you have the option to override it
         * if you wish.
         */
        "package-json"?: string;
    };

    /**
     * The develop task is what you would use for developing and debugging your project.
     */
    develop?: IBaseJobOptions;

    /**
     * The build task is what compiles the project for production. It will produce a build artifact against a checksum
     * of involved dependencies so that Hammerpack can potentially reuse builds.
     */
    build?: IBaseJobOptions;

    /**
     * The test task is what you would use for running automated tests for your project.
     */
    test?: IBaseJobOptions;

    /**
     * The run task describes how the build artifact should be run. This would typically be used in production.
     */
    run?: IBaseJobOptions;

    /**
     * The deploy task describes how the build artifact should be deployed to a system.
     */
    deploy?: IBaseJobOptions;
}
