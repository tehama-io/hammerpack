/**
 * Base options for webpack-based plugins.
 */
import {IInverseAliasOptions} from "./IInverseAliasOptions";

export interface IWebpackOptions {
    /**
     * Aliasing support for imports. Replaces the key with the value in imports.
     *
     * Usually used for replacing named imports with relative paths so that it is easier to maintain
     * the imports. See examples in the link below.
     *
     * See:
     * - https://webpack.js.org/configuration/resolve/#resolve-alias
     */
    alias?: _.Dictionary<string>;

    /**
     * This is effectively the inverse of alias:
     *
     * With alias, you replace named imports with relative paths so that you don't have to use relative paths
     * everywhere.
     *
     * With inverseAlias, you replace relative paths with named imports. The best use case for this is when you want to
     * exclude paths from being bundled, because they are a peer dependency.
     *
     * For example, let's say that you have a repo with two projects:
     * 1. core-lib
     *      - core.js
     * 2. web-lib
     *      - web.js
     *
     * Now, web.js has an import defined such as:
     *
     * `import x = require("../core-lib/core.js")`
     *
     * When core-lib is bundled, it will be an independant package. When web-lib is bundled, it will also bundle core-lib
     * because it depends on core-lib. But how can we prevent core-lib from being bundled in web-lib?
     *
     * We use inverseAlias in the web.hammerpack.yaml file:
     *
     * ```
     * inverseAlias:
     *      - find: ${repo:root-directory}/src/core-lib
     *      - replace: core-lib
     * ```
     *
     * Now when web-lib is bundled, it will not include core.js, but instead will be required as an external dependency
     * using `core-lib`.
     *
     * Finally, when generating the package.json, hammerpack needs to know the version of core-lib. You can specify
     * the version using extraNpmModules parameter. For example, in web.hammerpack.yaml file:
     *
     * ```
     * extraNpmModules:
     *      - core-lib: 1.0.0
     * ```
     */
    inverseAlias?: IInverseAliasOptions | Array<IInverseAliasOptions>;

    /**
     * One or more extra NPM modules that need to be included which are not `require`d by code.
     *
     * Note that any NPM module that is `require`d in code is automatically included in the final bundle.
     */
    extraNpmModules?: string | string[] | _.Dictionary<string>;

    /**
     * Any other things you want to add to the final package.json
     */
    otherPackageAdditions?: _.Dictionary<string>;
}