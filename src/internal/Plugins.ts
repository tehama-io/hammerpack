import _ = require("lodash");
import {PluginType} from "../public/plugins/PluginType";

/**
 * Separated from PluginManager to avoid circular dependencies for OOTB plugins in Hammerpack.
 */
// tslint:disable-next-line
export const Plugins: _.Dictionary<PluginType> = {};