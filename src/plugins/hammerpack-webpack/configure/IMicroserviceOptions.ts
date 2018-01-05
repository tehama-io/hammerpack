import {IWebpackBundleOptions} from "../internal/IWebpackBundleOptions";
import {IWebpackOptions} from "../internal/IWebpackOptions";

export interface IMicroserviceOptions  extends IWebpackOptions, IWebpackBundleOptions {

    /**
     * Whether to enable HTTPS
     *
     * Default: will try to use env-var-files to load this, otherwise false.
     */
    enableHttps?: boolean;

    /**
     * What host to attach to.
     *
     * Default: will try to use env-var-files to load this, otherwise localhost
     */
    host?: string;

    /**
     * What port to attach to.
     *
     * Default: will try to use env-var-files to load this, otherwise 8080
     */
    port?: number;
}
