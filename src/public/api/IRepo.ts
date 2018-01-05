import {IPackageJson} from "./IPackageJson";

/**
 * Represents a monolithic Repo that contains several projects.
 */
export interface IRepo {
    /**
     * The root directory is where all the projects are stored.
     */
    rootDirectoryPath: string;

    /**
     * The root src directory. See IConfigOptions#"root-src-directory"
     */
    rootSrcDirectoryPath: string;

    /**
     * The package.json path of the repo.
     */
    packageJsonPath: string;

    /**
     * The full package json loaded from the root directory of the repo.
     */
    packageJson: IPackageJson;
}