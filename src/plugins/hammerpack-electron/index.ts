import _ = require("lodash");

import {ITaskPlugin} from "../../public/plugins/ITaskPlugin";
import {IPluginIndex} from "../../public/plugins/IPluginIndex";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ITaskPlugin>): void => {
    // pluginManager["develop:apiservice"] = ;
};

export default fn;