import _ = require("lodash");

import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {consoleLogger} from "./ConsoleLogger";
import {ILogPlugin} from "../../public/plugins/ILogPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ILogPlugin>): void => {
    pluginManager["log:console"] = consoleLogger;
};

export default fn;