import _ = require("lodash");
import * as fs from "fs";
import * as path from "path";
import anymatch = require("anymatch");
import {IPackageJson} from "../../../public/api/IPackageJson";
import {ILogger} from "../../../public/api/ILogger";
import {IInverseAliasOptions} from "./IInverseAliasOptions";
import {PathUtils} from "../../../public/utils/PathUtils";

export class NodeExternals {
    versionsUsed: _.Dictionary<string> = {};
    packageVersions: _.Dictionary<string> = {};
    private logger: ILogger;
    private rootDir: string;
    private srcDir: string;
    private outputDir: string;
    private workingDir: string;
    private projectDependencies: string[];
    private packageJson: IPackageJson;
    private includeAbsolutePaths: boolean;
    private whitelist: string[];
    private importType: string;
    private inverseAliases: IInverseAliasOptions[];

    constructor(logger: ILogger,
                packageJson: IPackageJson,
                rootDir: string, srcDir?: string, outputDir?: string, workingDir?: string,
                projectDependencies?: string[],
                inverseAliases?: IInverseAliasOptions[],
                includeAbsolutePaths?: boolean,
                whitelist?: string[], importType?: string) {
        this.logger = logger;
        this.packageJson = packageJson;
        this.rootDir = rootDir;
        this.srcDir = srcDir;
        this.outputDir = outputDir;
        this.workingDir = workingDir;
        this.projectDependencies = projectDependencies || [];
        this.inverseAliases = inverseAliases;
        this.includeAbsolutePaths = includeAbsolutePaths;
        this.whitelist = whitelist || [];
        this.importType = importType || "commonjs";

        this.readPackageJson();
        this.readNodeModules();
    }

    public webpackExternalsWithBundling(
        context: string, request: string, callback: (err?: Error, result?: string) => void): any {
        return this.webpackExternals(false, context, request, callback);
    }

    public webpackExternalsWithoutBundling(
        context: string, request: string, callback: (err?: Error, result?: string) => void): any {
        return this.webpackExternals(true, context, request, callback);
    }

    public webpackExternals(
        externalize: boolean, context: string, request: string, callback: (err?: Error, result?: string) => void): any {

        let changeRequest: boolean = false;
        let newRequest: string = "";

        // first check for inverse aliases
        if (this.srcDir && this.outputDir && context &&
            context.startsWith(this.outputDir) &&
            request && request.startsWith(".")) {
            const relativeContext = path.relative(this.outputDir, context);
            const srcDirContext = path.resolve(this.srcDir, relativeContext);
            const workingDirReq = path.resolve(srcDirContext, request);

            // check if this file can be imported according to project dependencies
            // it's okay if the import is within the same project...
            if (this.projectDependencies && this.workingDir) {
                let found: boolean = workingDirReq.startsWith(_.trimEnd(this.workingDir, "/\\"));
                if (!found) {
                    for (const dependency of this.projectDependencies) {
                        if (workingDirReq.startsWith(dependency)) {
                            found = true;
                            break;
                        }
                    }
                }

                if (!found && fs.existsSync(workingDirReq)) {
                    const error = new Error("The file " + workingDirReq + " cannot be imported because it is not defined under the project's dependencies.");
                    this.logger.error(error);
                    callback(error);
                    return;
                }
            }

            if (this.inverseAliases && this.inverseAliases.length > 0) {
                for (const inverseAlias of this.inverseAliases) {
                    const pathToMatch = PathUtils.getAsAbsolutePath(inverseAlias.find, this.workingDir);
                    if ((anymatch(pathToMatch, workingDirReq) || pathToMatch.startsWith(workingDirReq)) &&
                        !anymatch(pathToMatch, srcDirContext) &&
                        !pathToMatch.startsWith(srcDirContext)) {
                        newRequest = inverseAlias.replace;
                        changeRequest = true;
                        break;
                    }
                }
            }
        }

        // now check for external modules
        if (!changeRequest) {
            // request can be in the form of xyz!abc!mno
            const requests: string[] = request.split("!");

            for (let i: number = 0; i < requests.length; i++) {
                const pathAfterNodeModules: string = this.trimUptoNodeModulesPath(requests[i]);
                let moduleName: string;

                if (pathAfterNodeModules.startsWith("@")) {
                    moduleName = pathAfterNodeModules;
                } else {
                    moduleName = pathAfterNodeModules.split("/")[0];
                }

                if (moduleName && this.packageVersions[moduleName] && !anymatch(this.whitelist, moduleName)) {
                    this.versionsUsed[moduleName] = this.packageVersions[moduleName];
                    changeRequest = true;
                }

                newRequest += pathAfterNodeModules;
                if (i < requests.length - 1) {
                    newRequest += "!";
                }
            }
        }

        if (changeRequest && externalize) {
            newRequest = _.trim(newRequest, "!");
            return callback(null, this.importType + " " + newRequest);
        } else {
            return callback();
        }
    }

    trimUptoNodeModulesPath(request: string): string {
        return request.replace(/^.*?\/node_modules\//, "");
    }

    readPackageJson(): void {
        this.readFromPackageJsonCollection(this.packageJson.dependencies);
        this.readFromPackageJsonCollection(this.packageJson.devDependencies);
        this.readFromPackageJsonCollection(this.packageJson.peerDependencies);
        this.readFromPackageJsonCollection(this.packageJson.optionalDependencies);
    }

    readFromPackageJsonCollection(collection: { [p: string]: string }) {
        if (!collection) {
            return;
        }

        _.forEach(collection, (version: string, name: string) => {
            if (version && version.startsWith("http")) {
                this.packageVersions[name] = version;
            } else {
                this.packageVersions[name] = this.readPackageVersion(name);
            }
        });
    }

    readNodeModules(): void {
        try {
            const dirNames: string[] = fs.readdirSync(path.resolve(this.rootDir, "node_modules"));
            _.forEach(dirNames, (dirName: string) => {
                if (!this.packageVersions[dirName] && !dirName.startsWith(".")) {
                    this.packageVersions[dirName] = this.readPackageVersion(dirName);
                }
            });
        } catch (e) {
            // ignore
        }
    }

    readPackageVersion(packageName: string): string {
        const packageJsonPath: string = path.resolve(this.rootDir, "node_modules", packageName, "package.json");
        if (packageJsonPath) {
            try {
                const packageJson: IPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8").toString());
                return packageJson.version || "*";
            } catch (e) {
                // fall below
            }
        }

        return "*";
    }
}