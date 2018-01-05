import {IWebpackCopyStructure} from "../configure/IWebpackCopyStructure";

/**
 * Options for the webpack bundle that will be generated.
 */
export interface IWebpackBundleOptions {

    /**
     * The entry file that will be called to start the bundle.
     */
    entry: string;

    /**
     * What files and directories to copy over into the main directory where the bundle bundle will be hosted.
     *
     * Note that the copied files will be available in a flat structure in the output directory (the same directory as
     * process.cwd() when the bundle is launched).
     *
     * You can either supply a single string denoting the file path you want to copy, an array of strings of the
     * file paths you want to copy, or an array of `IWebpackCopyStructure`s.
     */
    copy?: string | IWebpackCopyStructure | Array<string | IWebpackCopyStructure>;

    /**
     * What port for attaching debugger. This setting only works for the develop task.
     *
     * Default: 5858
     */
    debugPort?: number;

    /**
     * (From http://prestonparry.com/articles/IncreaseNodeJSMemorySize/)
     *
     * By default, node limits itself to 1.76 GB on 64 bit machines. You can bump this up to a theoretically
     * unlimited amount, though various versions of the docs will claim therwise.
     *
     * This sets the --max_old_space_size=<memorySize> parameter
     *
     * Default: Node default.
     */
    memorySize?: number;
}