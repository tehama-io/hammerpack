import _ = require("lodash");
import {IWebpackOptions} from "../internal/IWebpackOptions";
import {IWebpackBundleOptions} from "../internal/IWebpackBundleOptions";

export interface IWebserviceOptions extends IWebpackOptions {

    /**
     * Properties of the client.
     */
    client: {
        /**
         * The entry file that will be called to start the client.
         */
        entry: string;

        /**
         * This is the default URL path that a browser will use to resolve the client-side resources with.
         *
         * Note that this should be an absolute path, not a relative one.
         *
         * Default: /resources
         */
        browserPath?: string;

        /**
         * Adds this object to the window object on the client side.
         *
         * See:
         * - https://webpack.js.org/plugins/define-plugin/
         */
        define?: object;

        /**
         * Allows shimming modules in the client.
         *
         * See:
         * - https://webpack.js.org/plugins/provide-plugin/
         * - https://webpack.github.io/docs/shimming-modules.html
         */
        provide?: _.Dictionary<string>;
    };

    /**
     * Properties of the server that will be run.
     */
    server: IWebpackBundleOptions & {

        /**
         * Whether to enable HTTPS
         *
         * Default: will try to use env-var-files to load this, otherwise false.
         */
        enableHttps?: boolean;

        /**
         * The public URL where the webservice will be running.
         *
         * Default: will try to use env-var-files to load this, otherwise http://localhost:8080
         */
        publicUrl?: string;

        /**
         * The public URL where the hot-reload server will be running. This setting only works for the develop task.
         *
         * Default: will try to use env-var-files to load this, otherwise http://localhost:8081
         */
        hotreloadPublicUrl?: string;

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

        /**
         * What port for hot-reload server. This setting only works for the develop task.
         *
         * Default: will try to use env-var-files to load this, otherwise 8081
         */
        hotReloadPort?: number;
    };
}
