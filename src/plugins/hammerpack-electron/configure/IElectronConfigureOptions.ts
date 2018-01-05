import {IManifest} from "../../../public/IManifest";
import {IElectronDevelopOptions} from "./IElectronDevelopOptions";
import {IElectronBuildOptions} from "./IElectronBuildOptions";
import {IElectronRunOptions} from "./IElectronRunOptions";

export interface IElectronConfigureOptions extends IManifest {
    develop?: IElectronDevelopOptions;
    build?: IElectronBuildOptions;
    run?: IElectronRunOptions;
}