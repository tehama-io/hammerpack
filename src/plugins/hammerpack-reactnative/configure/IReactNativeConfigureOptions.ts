import {IManifest} from "../../../public/IManifest";
import {IReactNativeDevelopOptions} from "./IReactNativeDevelopOptions";
import {IReactNativeBuildOptions} from "./IReactNativeBuildOptions";
import {IReactNativeRunOptions} from "./IReactNativeRunOptions";

export interface IReactNativeConfigureOptions extends IManifest {
    develop?: IReactNativeDevelopOptions;
    build?: IReactNativeBuildOptions;
    run?: IReactNativeRunOptions;
}
