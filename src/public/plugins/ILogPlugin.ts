import async = require("async");
import {ILogPluginParams} from "../options/logging/ILogPluginParams";

export type ILogPlugin = (params: ILogPluginParams, result: async.AsyncResultCallback<object, Error>) => void;