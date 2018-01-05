import {ITaskPlugin} from "./ITaskPlugin";
import {ILogPlugin} from "./ILogPlugin";
import {ICachePlugin} from "./ICachePlugin";

export type PluginType = ITaskPlugin | ILogPlugin | ICachePlugin;