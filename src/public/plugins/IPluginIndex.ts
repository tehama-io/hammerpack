import _ = require("lodash");
import {PluginType} from "./PluginType";

export type IPluginIndex = (pluginManager: _.Dictionary<PluginType>) => void;