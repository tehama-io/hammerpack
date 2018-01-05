import _ = require("lodash");

import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {fileLogger} from "./FileLogger";
import {dailyRotateFileLogger} from "./DailyRotateFileLogger";
import {ILogPlugin} from "../../public/plugins/ILogPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ILogPlugin>): void => {
    pluginManager["log:files"] = fileLogger;
    pluginManager["log:dailyRotateFiles"] = dailyRotateFileLogger;
};

export default fn;