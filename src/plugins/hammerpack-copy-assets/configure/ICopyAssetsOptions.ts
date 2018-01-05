/**
 * Copies assets from the given source directories to the hammerpack staging area so that other plugins can use
 * these files to compile code.
 */
export interface ICopyAssetsOptions {

    /**
     * The directories from which to copy assets. Note that this set of dirs can be anywhere and does not necessarily
     * have to be under rootDir. Also, if any of the paths are relative paths, then they will be resolved relative
     * to the directory in which the Hammerpack manifest file is.
     *
     * Use anymatch syntax (https://www.npmjs.com/package/anymatch).
     *
     * E.g.:
     * ```
     * dirs:
     *   - ./assets/**
     *   - ${repo:root-directory}/assets/**
     * ```
     *
     * Default: ${same directory as the Hammerpack manifest file}/**
     */
    dirs?: string|(string|RegExp)[];

    /**
     * File names and extensions to include.
     *
     * E.g.:
     * ```
     * filenames:
     *   - *.css
     *   - /\*\.(htm|html)$/
     * ```
     *
     * Default: /\.(js|css|less|sass|scss|jp[e]?g|png|gif|svg|ico|htm|html|woff|woff2|eot|ttf|env|config|json|yaml|txt|md|csv|pdf|doc|xls)$/
     *
     */
    filenames?: string|(string|RegExp)[];

    /**
     * The directories to ignore when copying assets. This can be a subset of dirs that you wish to exclude.
     *
     * Follow the same format as dirs.
     *
     * Default: none.
     */
    ignoreDirs?: string|(string|RegExp)[];

    /**
     * The file names and extensions to exclude when copying assets.
     *
     * Follow the same format as filenames.
     *
     * Default: none.
     */
    ignoreFilenames?: string|(string|RegExp)[];
}