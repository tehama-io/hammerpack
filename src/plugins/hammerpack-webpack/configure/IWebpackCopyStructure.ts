import _ = require("lodash");

export interface IWebpackCopyStructure {
    /**
     * The path of the file or directory you want to copy.
     */
    from: string;

    /**
     * The relative path of the directory where you want to copy to. This will be relative to where the bundles are
     * output.
     *
     * Default: /
     */
    to?: string;

    /**
     * Any string substitutions that you want to do for the files copied.
     *
     * The key is the string you want to replace, the value is the RegExp (defined as string) that you want to replace
     * with.
     *
     * If this is defined, the file will be copied with a UTF8 encoding. If this is not defined, the file will be
     * copied as-is.
     */
    replace?: _.Dictionary<string>;
}