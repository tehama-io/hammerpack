import fs = require("fs");
import {IPackageJson} from "../public/api/IPackageJson";
import {PathUtils} from "../public/utils/PathUtils";
import {SimpleStore} from "./SimpleStore";
import {IRepo} from "../public/api/IRepo";

export class Repo implements IRepo {
    rootDirectoryPath: string;
    rootSrcDirectoryPath: string;
    packageJsonPath: string;

    packageJson: IPackageJson;

    constructor(store: SimpleStore, workingDir: string) {
        this.rootDirectoryPath = PathUtils.getAsAbsolutePath(store.get("repo:root-directory"), workingDir);
        if (!this.rootDirectoryPath) {
           this.rootDirectoryPath = workingDir;
        }

        this.rootSrcDirectoryPath = PathUtils.getAsAbsolutePath(store.get("repo:root-src-directory"), workingDir);
        if (!this.rootSrcDirectoryPath) {
            this.rootSrcDirectoryPath = this.rootDirectoryPath;
        }

        this.packageJsonPath = PathUtils.getAsAbsolutePath(store.get("repo:package-json"), workingDir);
        if (!this.packageJsonPath) {
            this.packageJsonPath = PathUtils.searchForPath(this.rootDirectoryPath, "package.json");
            if (!this.packageJsonPath) {
                throw new Error("Cannot find package.json file in repo:root-directory or it's parent folder hierarchy. " +
                    "The repo:root-directory is ");
            }
        }

        this.packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath).toString());
    }
}
