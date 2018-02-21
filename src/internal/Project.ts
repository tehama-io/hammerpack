import _ = require("lodash");
import {SimpleStore} from "./SimpleStore";
import {IProject} from "../public/api/IProject";
import {PathUtils} from "../public/utils/PathUtils";
const getSlug: any = require("speakingurl");

export class Project implements IProject {

    name: string;
    description: string;
    slug: string;
    directory: string;
    dependencies: string[] = [];

    constructor(nconf: SimpleStore, workingDir: string) {
        this.name = nconf.get("project:name");

        if (!this.name) {
            throw new Error(
                "You did not specify a name for the project. Supply a name for the project with project:name.");
        }

        this.slug = getSlug(this.name);
        this.description = nconf.get("project:description") || "";
        this.directory = _.trimEnd(workingDir, "/\\");

        const dependencies: string = nconf.get("project:dependencies") || [];
        _.forEach(dependencies, (dependency: string) => {
            this.dependencies.push(_.trimEnd(PathUtils.getAsAbsolutePath(dependency, workingDir), "/\\"));
        });
    }
}
