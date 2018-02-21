/**
 * A Project is something within a Repo that can be developed, built, run, tested and deployed.
 */
export interface IProject {

    /**
     * The name of the project.
     */
    name: string;

    /**
     * The slug is a URL and filesystem friendly name that will be generated from the project name.
     */
    slug: string;

    /**
     * The description of the project, purely for documentation purposes.
     */
    description: string;

    /**
     * The absolute path of the directory where this project is located.
     */
    directory: string;

    /**
     * The dependencies of this project. This is an array of absolute paths.
     */
    dependencies: string[];
}