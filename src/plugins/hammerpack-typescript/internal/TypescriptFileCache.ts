import * as ts from "typescript";
import fs = require("fs");

export class TypescriptFileCache {
    // since we are single threaded we can afford to do make fileCache global even when there are multiple develop jobs
    // running in the same process

    static fileCache: _.Dictionary<string> = {};

    static readFile(path: string, encoding?: string): string | undefined {
        let contents: string = this.fileCache[path];
        if (!contents) {
            contents = fs.readFileSync(path, encoding).toString();
            this.fileCache[path] = contents;
        }

        return contents;
    }

    static writeFile(path: string, data: string, writeByteOrderMark?: boolean): void {
        ts.sys.writeFile(path, data, writeByteOrderMark);
        this.fileCache[path] = data;
    }
}