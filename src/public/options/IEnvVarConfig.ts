/**
 * Defines where to find the environment variables for project.
 *
 * Note: this is different from the configuration of Hammerpack itself. These files define the project-specific environment
 * variables.
 */
export interface IEnvVarConfig {
    dotenv?: string|string[];
    "nconf-yaml"?: string|string[];
    "nconf-json"?: string|string[];
}