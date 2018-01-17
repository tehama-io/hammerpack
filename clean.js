var path = require("path");
var fs = require("fs");
var rimraf = require("rimraf");

var distDir = path.resolve(__dirname, "dist");
if (fs.existsSync(distDir)) {
    rimraf.sync(distDir);
}