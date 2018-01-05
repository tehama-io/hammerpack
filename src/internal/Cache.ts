import levelup = require("levelup");
import _ = require("lodash");
import {ICache} from "../public/cache/ICache";
import {ICachePluginResult} from "../public/plugins/ICachePlugin";

export class Cache implements ICache {
    private inmem: _.Dictionary<any> = {};
    private setToFlush: _.Dictionary<boolean> = {};
    private delToFlush: _.Dictionary<boolean> = {};
    private persisted: levelup.LevelUp;

    constructor(cacheOptions?: ICachePluginResult) {
        if (cacheOptions && cacheOptions.db) {
            this.persisted = levelup(cacheOptions.db as any, cacheOptions.options);
        }
    }

    getMemSync(key: string): any {
        if (this.delToFlush[key]) {
            return null;
        } else {
            return this.inmem[key];
        }
    }

    setMemSync(key: string, value: any): ICache {
        if (value === null || value === undefined) {
            delete this.inmem[key];
            delete this.setToFlush[key];
            this.delToFlush[key] = true;
        } else {
            this.inmem[key] = value;
            this.setToFlush[key] = true;
            delete this.delToFlush[key];
        }

        return this;
    }

    get(key: string, callback: (err: Error, value?: any) => void): void {
        let inmem: string = this.getMemSync(key);
        if (!inmem && !this.delToFlush[key] && this.persisted) {
            this.persisted.get(key, (err: any, value: any) => {
                if (err) {
                    if (err.notFound) {
                        callback(null, null);
                    } else {
                        callback(err);
                    }
                } else {
                    inmem = this.decode(value);
                    this.inmem[key] = inmem;
                    delete this.setToFlush[key];
                    delete this.delToFlush[key];
                    callback(null, inmem);
                }
            });
        } else {
            callback(null, inmem);
        }
    }

    set(key: string, value: any, callback: (err: Error) => void): void {
        if (value === null || value === undefined) {
            this.delToFlush[key] = true;

            if (this.persisted) {
                this.persisted.del(key, (error: any) => {
                    if (error) {
                        callback(error);
                    } else {
                        delete this.inmem[key];
                        delete this.setToFlush[key];
                        delete this.delToFlush[key];
                        callback(null);
                    }
                });
            } else {
                delete this.inmem[key];
                delete this.setToFlush[key];
                delete this.delToFlush[key];
                callback(null);
            }
        } else {
            if (this.persisted) {
                this.persisted.put(key, this.encode(value), (error: any) => {
                    if (error) {
                        callback(error);
                    } else {
                        this.inmem[key] = value;
                        delete this.setToFlush[key];
                        delete this.delToFlush[key];
                        callback(null);
                    }
                });
            } else {
                this.inmem[key] = value;
                delete this.setToFlush[key];
                delete this.delToFlush[key];
                callback(null);
            }
        }
    }

    flush(callback: (err: Error) => void): void {
        const ops: levelup.Batch[] = [];

        _.forEach(this.setToFlush, (value: boolean, key: string) => {
            ops.push({
                type: "put",
                key: key,
                value: this.encode(this.inmem[key])
            } as levelup.Batch);
        });

        _.forEach(this.delToFlush, (value: boolean, key: string) => {
            ops.push({
                type: "del",
                key: key
            } as levelup.Batch);
        });

        const oldSetToFlush: _.Dictionary<boolean> = this.setToFlush;
        const oldDelToFlush: _.Dictionary<boolean> = this.delToFlush;

        this.setToFlush = {};
        this.delToFlush = {};

        this.persisted.batch(ops, (error: any) => {
            if (error) {
                // have to put everything back, but can't really just put it back because other things may have come
                // in since then.
                _.forEach(oldSetToFlush, (value: boolean, key: string) => {
                    this.setToFlush[key] = true;
                });
                _.forEach(oldDelToFlush, (value: boolean, key: string) => {
                    this.delToFlush[key] = true;
                });
            }

            callback(error);
        });
    }

    clearFlushQueue(): void {
        this.setToFlush = {};
        this.delToFlush = {};
    }

    clearMem(): void {
        this.inmem = {};
    }

    private encode(value: any): string {
        return JSON.stringify(value);
    }

    private decode(value: string): any {
        return JSON.parse(value);
    }


}