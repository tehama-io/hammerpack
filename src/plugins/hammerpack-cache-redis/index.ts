import _ = require("lodash");

import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {redisCache} from "./RedisCache";
import {ICachePlugin} from "../../public/plugins/ICachePlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ICachePlugin>): void => {
    pluginManager["system:cache:redis"] = redisCache;
};

export default fn;