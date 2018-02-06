// To edit this file in an IDE, comment out the next line and the last line in the file.
export const startWebservice: string = `
var path = require("path");
var https = require("https");
var fetch = require("node-fetch");
var async = require("async");
var _ = require("lodash");

var httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

/**
 * In order for this file to work, the structure of the output folder should look like:
 *
 * dist
 *  /start-webservice.js (this file)
 *  /server.bundle.js
 *  /resources
 *      /client.[id].[hash].bundle.js
 *      /client.[id].[hash].bundle.js
 *      /vendors.[id].[hash].bundle.js
 *      /img/**
 *      /fonts/**
 *      /misc/**
 *
 *
 * This structure should be available when output with Hammerpack.
 */


function startServerBundle() {
    var serverBundle = path.resolve(__dirname, "server.bundle.js");
    var resourcesDir = path.resolve(__dirname, "resources");

    if (!process.env.HAMMERPACK_CLIENT_FILES) {
        throw new Error("Client files not found.");
    }

    var startupParams = {
        resources: {
            dir: resourcesDir,
            hotreload: process.env.HAMMERPACK_HOTRELOAD_PUBLICURL,
            img: "img",
            font: "font",
            misc: "misc",
            clientFiles: process.env.HAMMERPACK_CLIENT_FILES.split(","),
        },
        buildId: process.env.HAMMERPACK_VERSION,
        taskType: process.env.HAMMERPACK_TASK_TYPE || "build",
        projectName: process.env.HAMMERPACK_PROJECT_NAME
    };

    var serverBundleModule;
    try {
        serverBundleModule = require(serverBundle);
    } catch (e) {
        console.error("An exception occurred while requiring the server bundle.");
        console.error(e);
        process.exit(1);
        return;
    }
    
    var noServerModuleErrorMsg = "No server module found.";
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

function startServerBundleOnceHotReloadAvailable() {
    var filesToCheck = [];
    var clientFiles = process.env.HAMMERPACK_CLIENT_FILES.split(",");

    for (var file of clientFiles) {
        filesToCheck.push(process.env.HAMMERPACK_HOTRELOAD_PUBLICURL + "/" + file);
    }

    function checkAvailable() {
        var fns = filesToCheck.map(file => {
            return (callback) => {
                console.log("Checking: " + file);
                fetch(file, {
                    method: "GET",
                    timeout: 5000,
                    agent: process.env.HAMMERPACK_ENABLE_HTTPS === "true" ? httpsAgent : undefined
                }).then(response => {
                    if (response.status === 200) {
                        response.text().then(() => callback()).catch(callback);
                    } else {
                        callback(new Error("Not available"));
                    }
                }).catch(callback);
            }
        });

        async.parallel(fns, (err) => {
            if (err) {
                setTimeout(() => checkAvailable());
            } else {
                startServerBundle();
            }
        });
    }

    checkAvailable();
}



if (process.env.HAMMERPACK_TASK_TYPE === "develop") {
    startServerBundleOnceHotReloadAvailable();
} else {
    startServerBundle();
}
`;