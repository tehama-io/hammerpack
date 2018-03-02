import _ = require("lodash");

import {ITaskPlugin} from "../../public/plugins/ITaskPlugin";
import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {createJestPlugin} from "./internal/JestPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ITaskPlugin>): void => {
    // tslint:disable-next-line
    pluginManager["jest"] = createJestPlugin;
};

export default fn;