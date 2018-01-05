import _ = require("lodash");

import {ITaskPlugin} from "../../public/plugins/ITaskPlugin";
import {IPluginIndex} from "../../public/plugins/IPluginIndex";
import {createWebservicePlugin} from "./internal/WebservicePlugin";
import {createMicroservicePlugin} from "./internal/MicroservicePlugin";
import {createWebLibraryPlugin} from "./internal/WebLibraryPlugin";

const fn: IPluginIndex = (pluginManager: _.Dictionary<ITaskPlugin>): void => {
    // tslint:disable
    pluginManager["webservice"] = createWebservicePlugin;
    pluginManager["microservice"] = createMicroservicePlugin;
    pluginManager["weblibrary"] = createWebLibraryPlugin;
    // tslint:enable
};

export default fn;