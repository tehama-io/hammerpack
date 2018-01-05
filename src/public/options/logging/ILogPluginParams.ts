import {Config} from "../../../internal/Config";

export interface ILogPluginParams {
    options: object|Array<object>;
    config: Config;
    label: string;
}