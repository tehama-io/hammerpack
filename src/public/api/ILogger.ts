/**
 * Common logger interface.
 */
export interface ILogger {
    error(message: string|Error): void;
    warn(message: string|Error): void;
    info(message: string|Error): void;
    verbose(message: string|Error): void;
    debug(message: string|Error): void;
    silly(message: string|Error): void;
}