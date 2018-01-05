import _ = require("lodash");

import {ITaskPlugin} from "../../public/plugins/ITaskPlugin";
import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {createCopyAssetsPlugin} from "./internal/CopyAssetsPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ITaskPlugin>): void => {
    // tslint:disable-next-line
    pluginManager["copyassets"] = createCopyAssetsPlugin;
};

export default fn;