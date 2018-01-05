export interface ILogstashTCPLogOptions {
    /**
     * The logstash host.
     *
     * Default: 127.0.0.1
     */
    host?: string;

    /**
     * The logstash port.
     *
     * Default: 28777
     */
    port?: number;

    /**
     * The name of this node. You may want to customize this to be the node IP instead.
     *
     * Default: process.title.
     */
    node_name?: string;

    /**
     * The pid you want to log all messages with.
     *
     * Default: process.pid
     */
    pid?: string;

    /**
     * Enable SSL when connecting with lgostash.
     *
     * Default: false
     */
    ssl_enable?: boolean;

    /**
     * The key to use to connect with SSL.
     */
    ssl_key?: string;

    /**
     * The certificate to use to connect with SSL.
     */
    ssl_cert?: string;

    /**
     * The certificate authority to use to connect with SSL.
     */
    ca?: string;

    /**
     * The SSL key passphrase to use to connect with SSL.
     */
    ssl_passphrase?: string;

    /**
     * Whether to reject when we cannot authorize or not.
     */
    rejectUnauthorized?: string;
}