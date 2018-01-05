import _ = require("lodash");

import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {kafkaLogger} from "./KafkaLogger";
import {ILogPlugin} from "../../public/plugins/ILogPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ILogPlugin>): void => {
    pluginManager["log:kafka"] = kafkaLogger;
};

export default fn;