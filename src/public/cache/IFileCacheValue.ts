export interface IFileCacheValue {
    transformedText?: string;
    mapText?: string;
    definitionText?: string; // .d.ts file
    dependencies?: string[];
}