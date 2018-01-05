export interface IFileCacheKey {
    /**
     * This is file path from the root-directory of a project
     */
    filename: string;

    /**
     * This is a cryptographic hash generated from the original contents of the file.
     */
    hash: string;
}