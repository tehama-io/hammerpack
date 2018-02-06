// To edit this file in an IDE, comment out the next line and the last line in the file.
export const startMicroservice: string = `
var path = require("path");
var _ = require("lodash");

/**
 * In order for this file to work, the structure of the output folder should look like:
 *
 * dist
 *  /start-microservice.js (this file)
 *  /microservice.bundle.js
 *
 *
 * This structure should be available when output with Hammerpack.
 */


function startMicroserviceBundle() {
    var serverBundle = path.resolve(__dirname, "microservice.bundle.js");

    var startupParams = {
        buildId: process.env.HAMMERPACK_VERSION,
        taskType: process.env.HAMMERPACK_TASK_TYPE || "build",
        projectName: process.env.HAMMERPACK_PROJECT_NAME
    };

    var serverBundleModule;
    try {
        serverBundleModule = require(serverBundle);
    } catch (e) {
        console.error("An exception occurred while requiring the microservice bundle.");
        console.error(e);
        process.exit(1);
        return;
    }

    var noServerModuleErrorMsg = "No microservice.bundle module found.";
    if (!serverBundleModule) {
        console.log(noServerModuleErrorMsg);
        throw new Error(noServerModuleErrorMsg);
    }

    if (_.isFunction(serverBundleModule.default)) {
        serverBundleModule.default(startupParams);
    } else if (_.isFunction(serverBundleModule.main)) {
        serverBundleModule.main(startupParams);
    } else if (_.isFunction(serverBundleModule)) {
        serverBundleModule(startupParams);
    } else {
        console.error(noServerModuleErrorMsg);
        throw new Error(noServerModuleErrorMsg);
    }
}

startMicroserviceBundle();
`;