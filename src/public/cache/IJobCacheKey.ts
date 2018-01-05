/**
 * A cache entry for plugins to use in between jobs.
 */
export interface IPluginCacheKey {
    pluginName: string;
    key?: string;
}