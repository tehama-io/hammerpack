import _ = require("lodash");

import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {rocksdbCache} from "./RocksDBCache";
import {ICachePlugin} from "../../public/plugins/ICachePlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ICachePlugin>): void => {
    pluginManager["system:cache:rocksdb"] = rocksdbCache;
};

export default fn;