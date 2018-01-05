/**
 * Options to enable logging to Kafka.
 */
export interface IKafkaLogOptions {
    /**
     * The Kafka topic to publish to.
     */
    topic: string;

    /**
     * The Kafka REST Proxy host to publish to.
     */
    proxyHost?: string;

    /**
     * The Kafka REST Proxy port to publish to.
     */
    proxyPort?: string;

    /**
     * Top-level properties that should be added to the JSON object published to the kafka topic; useful if multiple
     * processes use the same topic
     */
    properties?: object;

    /**
     * An object of date formats to use; keys are the names of the keys the format should be added to, values are the
     * names of the formats (useful for cross-language usage of the logs to reduce transforms on the consumers). These
     * formats are: epoch (time in sec since Jan 1, 1970), jsepoch (time in ms since Jan 1, 1970), pyepoch (time in sec
     * since Jan 1, 1970, but floating point with ms resolution), iso (ISO datestring format)
     */
    dateFormats?: object;
}