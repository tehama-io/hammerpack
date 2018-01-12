import _ = require("lodash");

import {ITaskPlugin} from "../../public/plugins/ITaskPlugin";
import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {createWebservicePlugin} from "./internal/WebservicePlugin";
import {createMicroservicePlugin} from "./internal/MicroservicePlugin";
import {createLibraryPlugin} from "./internal/LibraryPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ITaskPlugin>): void => {
    // tslint:disable
    pluginManager["webservice"] = createWebservicePlugin;
    pluginManager["microservice"] = createMicroservicePlugin;
    pluginManager["library"] = createLibraryPlugin;
    // tslint:enable
};

export default fn;