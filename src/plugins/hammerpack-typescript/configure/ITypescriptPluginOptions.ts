export interface ITypescriptPluginOptions {

    /**
     * The files to start compiling from. This just needs to be, for example, the start file like index.ts.
     *
     * It can also be a pattern that uses any of the anymatch rules. Use anymatch syntax (https://www.npmjs.com/package/anymatch). E.g. **\/index.tsx
     *
     * Default: will look for the following file names in the same directory that the config file is in:
     *  - index.ts,
     *  - index.tsx,
     *  - main.ts,
     *  - main.tsx,
     *  - start.ts,
     *  - start.tsx,
     *  - root.ts,
     *  - root.tsx
     */
    "compile-files"?: string|string[];

    /**
     * The path to the tsconfig.json file.
     *
     * Default: ${repo:root-directory}/tsconfig.json
     */
    "tsconfig-json"?: string;

    /**
     * The path to the tslint.json file. If a tslint.json file could not be found then tslint will be disabled.
     *
     * If the value of this is `false`, then tslint will be disabled.
     *
     * Default: ${repo:root-directory}/tslint.json
     */
    "tslint-config-file"?: string;
}
