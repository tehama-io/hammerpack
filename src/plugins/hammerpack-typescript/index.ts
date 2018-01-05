import _ = require("lodash");

import {ITaskPlugin} from "../../public/plugins/ITaskPlugin";
import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {createTypescriptPlugin} from "./internal/TypescriptPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ITaskPlugin>): void => {
    // tslint:disable-next-line
    pluginManager["typescript"] = createTypescriptPlugin;
};

export default fn;