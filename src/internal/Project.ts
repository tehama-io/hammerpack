import {SimpleStore} from "./SimpleStore";
import {IProject} from "../public/api/IProject";
const getSlug: any = require("speakingurl");

export class Project implements IProject {

    name: string;
    description: string;
    slug: string;

    constructor(nconf: SimpleStore) {
        this.name = nconf.get("project:name");

        if (!this.name) {
            throw new Error(
                "You did not specify a name for the project. Supply a name for the project with project:name.");
        }

        this.slug = getSlug(this.name);
        this.description = nconf.get("project:description") || "";
    }
}
