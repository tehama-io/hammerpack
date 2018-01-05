/**
 * Parameters supplied to the entry file for a webservice server.
 */
export interface IWebServiceStartOptions {

    /**
     * The resources are where the fonts, icons, images, etc are saved.
     */
    resources: {

        /**
         * The directory where the resources are saved. Only use this if this task is a build task. Append the paths of
         * clients and vendors below to this directory path.
         */
        dir: string;

        /**
         * If this is a develop task, then this will be the hot reload server URL. Append the paths of clients and
         * vendors below to this URL.
         */
        hotreload: string;

        /**
         * The name of the directory with images.
         */
        img: string;

        /**
         * The name of the directory with fonts.
         */
        font: string;

        /**
         * The name of the directory with misc.
         */
        misc: string;

        /**
         * The names of the client files.
         */
        clientFiles: string[];
    };

    /**
     * The build ID.
     */
    buildId: string;

    /**
     * The type of task it was that launched this server.
     */
    taskType: "develop" | "build";
}