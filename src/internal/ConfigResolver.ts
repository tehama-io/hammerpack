import _ = require("lodash");
import async = require("async");
import {SimpleStore} from "./SimpleStore";
import {primitives} from "./Primitives";

export function resolveConfigVars(nconf: SimpleStore, sections: string[], callback: async.ErrorCallback<Error>): void {

    function setValue(path: string, value: primitives): void {
        if (_.isNil(value)) {
            throw new Error(`A variable in path ${path} cannot be resolved`);
        }

        const start: number = path.lastIndexOf("[");

        if (start >= 0 && path.charAt(path.length - 1) === "]") {
            const indexNum: number = parseInt(path.substring(start + 1, path.length - 1), 10);
            const key: string = path.substring(0, start);
            const val: primitives = nconf.get(key);
            val[indexNum] = value;
            nconf.set(key, val);
        } else {
            nconf.set(path, value);
        }
    }

    function evalValue(
        path: string, value: primitives, memoize?: _.Dictionary<boolean>): primitives {
        memoize = memoize || {};
        const newCurrentlyBeingResolved: _.Dictionary<boolean> = _.clone(memoize);

        if (newCurrentlyBeingResolved[path]) {
            throw new Error("Circular dependency detected (environment variable " + path + ").");
        }

        newCurrentlyBeingResolved[path] = true;

        if (_.isString(value)) {
            let strValue: string = value as string;
            let exitNow: boolean = false;
            const allDeps: string[] = getAllConfigVarDependencies(strValue);

            _.forEach(allDeps, (depPath: string) => {
                const dependencyValue: primitives = evalValue(
                    depPath, nconf.get(depPath), newCurrentlyBeingResolved);

                if (_.isString(dependencyValue)) {
                    strValue = strValue.replace("${" + depPath + "}", dependencyValue);
                } else {
                    setValue(path, dependencyValue);
                    exitNow = true;
                }
            });

            if (exitNow) {
                return nconf.get(path);
            }

            if (strValue.startsWith("javascript:")) {
                strValue = strValue.substring("javascript:".length, strValue.length);
                // tslint:disable-next-line
                strValue = eval(strValue);

                if (_.isNumber(strValue)) {
                    strValue = strValue + "";
                }
            }

            setValue(path, strValue);
            return strValue;
        } else {
            resolve(path, newCurrentlyBeingResolved);
            return nconf.get(path);
        }
    }

    function resolve(path: string, memoize?: _.Dictionary<boolean>): void {
        const val: primitives = nconf.get(path);
        if (_.isObject(val)) {
            _.forEach(val as object, (value: primitives, key: string) => {
                resolve(path + ":" + key, memoize);
            });
        } else if (_.isString(val)) {
            evalValue(path, val, memoize);
        } else if (_.isArray(val)) {
            _.forEach(val as Array<primitives>, (arrayValue: primitives, index: number) => {
                evalValue(path + "[" + index + "]", arrayValue, memoize);
            });
        }
    }

    _.forEach(sections, (section: string) => resolve(section));

    // TODO: may need to modify this if we allow promise based evaluation of javascript above.
    callback(null);
}



function getAllConfigVarDependencies(value: string): string[] {
    if (!value) {
        return [];
    }

    const vars: string[] = [];
    let current: number = 0;
    let lastIndex: number = 0;

    for (let i: number = 0; i < value.length; i++) {
        switch (current) {
            case 1:
                if (value.charAt(i) === "}") {
                    vars.push(value.substring(lastIndex, i));
                    current = 0;
                }
                break;
            default:
                if (value.charAt(i) === "$" && (i + 1) < value.length &&
                    value.charAt(i + 1) === "{") {
                    lastIndex = i + 2;
                    current = 1;
                }
        }
    }

    return vars;
}