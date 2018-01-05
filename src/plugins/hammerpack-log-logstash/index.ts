import _ = require("lodash");

import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {logstashTCPLogger} from "./LogstashTCPLogger";
import {logstashUDPLogger} from "./LogstashUDPLogger";
import {ILogPlugin} from "../../public/plugins/ILogPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ILogPlugin>): void => {
    pluginManager["log:logstashTCP"] = logstashTCPLogger;
    pluginManager["log:logstashUDP"] = logstashUDPLogger;
};

export default fn;