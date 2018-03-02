import {Plugins} from "./Plugins";
import {PluginType} from "../public/plugins/PluginType";
import typescript = require("../plugins/hammerpack-typescript/index");
import copyassets = require("../plugins/hammerpack-copy-assets/index");
import electron = require("../plugins/hammerpack-electron/index");
import logConsole = require("../plugins/hammerpack-log-console/index");
import logFiles = require("../plugins/hammerpack-log-files/index");
import logKafka = require("../plugins/hammerpack-log-kafka/index");
import logLogstash = require("../plugins/hammerpack-log-logstash/index");
import reactnative = require("../plugins/hammerpack-reactnative/index");
import webservice = require("../plugins/hammerpack-webpack/index");
import rocksdbCache = require("../plugins/hammerpack-cache-rocksdb/index");
import redisCache = require("../plugins/hammerpack-cache-redis/index");
import jestPlugin = require("../plugins/hammerpack-jest/index");

/**
 * Plugin manager allows you to add plugins to extend the functionality of Hammerpack.
 */
export class PluginManager {

    /**
     * A plugin module is the NPM package that contains one or more Hammerpack plugins.
     * @type {{}}
     */
    static pluginModules: _.Dictionary<boolean> = {};

    /**
     * A Hammerpack plugin defines some way of handling tasks, logging, caching, etc.
     *
     * @type {_.Dictionary<PluginType>}
     */
    static plugins: _.Dictionary<PluginType> = Plugins;

    private static alreadyInitialized: boolean;

    /**
     * Adds the OOTB plugins that come with Hammerpack. These are plugins you don't have to declare in
     * IBaseConfigureOptions#pluginModules configuration.
     *
     * We may want to separate these out into their own repos before we turn 1.0 :)
     */
    static initDefault() {
        if (this.alreadyInitialized) {
            return;
        }

        this.alreadyInitialized = true;

        PluginManager.pluginModules["hammerpack-typescript"] = true;
        typescript.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-copy-assets"] = true;
        copyassets.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-electron"] = true;
        electron.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-reactnative"] = true;
        reactnative.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-webservice"] = true;
        webservice.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-jest"] = true;
        jestPlugin.default(PluginManager.plugins);



        PluginManager.pluginModules["hammerpack-log-console"] = true;
        logConsole.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-log-files"] = true;
        logFiles.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-log-kafka"] = true;
        logKafka.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-log-logstash"] = true;
        logLogstash.default(PluginManager.plugins);



        PluginManager.pluginModules["hammerpack-cache-rocksdb"] = true;
        rocksdbCache.default(PluginManager.plugins);

        PluginManager.pluginModules["hammerpack-cache-redis"] = true;
        redisCache.default(PluginManager.plugins);
    }

}