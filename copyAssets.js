var shell = require('shelljs');
var fs = require("fs");

if (fs.existsSync("src/assets")) {
    shell.cp('-R', 'src/assets/', 'dist/assets/');
}

