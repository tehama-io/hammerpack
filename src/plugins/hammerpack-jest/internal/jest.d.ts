///<reference types="jest"/>


declare module "jest" {
    export function runCLI(config: jest.GlobalConfig & jest.ProjectConfig & {_: string|string[]}, path: string): Promise<object>;
}