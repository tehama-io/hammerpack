import async = require("async");

export enum EWatchEventType {
    ADD_FILE = "addFile",
    ADD_DIR = "addDir",
    CHANGE = "change",
    DELETE_FILE = "deleteFile",
    DELETE_DIR = "deleteDir",
    READY = "ready"
}

export type IWatchListener = (eventType: EWatchEventType, path: string, callback: async.ErrorCallback<Error>) => void;