export interface IPackageJson {
    name?: string;
    version?: string;
    description?: string;
    license?: string;
    private?: boolean;
    repository?: IPackageJsonRepository;
    scripts?: {[name: string]: string};
    author?: string;
    dependencies?: {[name: string]: string};
    devDependencies?: {[name: string]: string};
    peerDependencies?: {[name: string]: string};
    optionalDependencies?: {[name: string]: string};
}

export interface IPackageJsonRepository {
    type: string;
    url: string;
}
