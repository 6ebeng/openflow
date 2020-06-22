import * as winston from "winston";
import * as amqplib from "amqplib";

// tslint:disable-next-line: class-name
export class amqp_consumer {
    conn: amqplib.Connection = null;
    channel: amqplib.Channel; // channel: amqplib.ConfirmChannel;
    queue: string;
    private _logger: winston.Logger;
    private _ok: amqplib.Replies.AssertQueue;
    private connectionstring: string;
    public noAck: boolean;
    public OnMessage: any;
    public isClosing: boolean;

    constructor(logger: winston.Logger, connectionstring: string, queue: string) {
        this._logger = logger;
        this.queue = queue;
        this.connectionstring = connectionstring;
    }
    onerror(error) {
        try {
            this._logger.error(error);
        } catch (err) {
            console.error(error);
        }
    }
    onclose() {
        if (this.isClosing == true) return;
        setTimeout(() => { this.connect(this.noAck) }, 1000);
    }
    async connect(noAck: boolean): Promise<void> {
        try {
            this.isClosing = false;
            this.noAck = noAck;
            var me: amqp_consumer = this;
            if (this.conn != null) {
                this.conn.off("error", this.onerror);
                this.conn.off("close", this.onclose);
            }
            this.conn = await amqplib.connect(this.connectionstring + "?heartbeat=60");
            this.conn.on("error", this.onerror.bind(this));
            this.channel = await this.conn.createChannel();
            this._ok = await this.channel.assertQueue(this.queue, { durable: false });
            await this.channel.consume(this.queue, (msg) => { this._OnMessage(me, msg); }, { noAck: noAck });
            this._logger.info("Connected to " + new URL(this.connectionstring).hostname);
            this.conn.on("close", this.onclose.bind(this));
        } catch (error) {
            this._logger.error(error);
            this.onclose();
        }
    }
    async close(): Promise<void> {
        this.isClosing = true;
        if (this.channel != null && this.channel != undefined) { await this.channel.close(); this.channel = null; }
        if (this.conn != null && this.conn != undefined) { await this.conn.close(); this.conn = null; }
    }
    private _OnMessage(sender: amqp_consumer, msg: amqplib.ConsumeMessage): void {
        try {
            // sender._logger.info("OnMessage " + msg.content.toString());
            if (this.OnMessage !== null && this.OnMessage !== undefined) {
                if (!this.noAck || (msg.properties.replyTo !== null && msg.properties.replyTo !== undefined)) {
                    this.OnMessage(msg, (result) => {
                        try {
                            if (!this.noAck) { this.channel.ack(msg); }
                            if (msg.properties.replyTo !== null && msg.properties.replyTo !== undefined) {
                                this.channel.sendToQueue(msg.properties.replyTo, Buffer.from(result), { correlationId: msg.properties.correlationId });
                            }
                        } catch (error) {
                            this._logger.error(error);
                        }
                    });
                } else {
                    this.OnMessage(msg, null);
                }
            } else if (this.noAck) {
                // todo: should we just auto ack ?  
            }
        } catch (error) {
            this._logger.error(error);
        }
    }
    SendMessage(msg: string, queue: string, correlationId: string, sendreply: boolean): void {
        if (correlationId == null || correlationId == "") { correlationId = this.generateUuid(); }
        this._logger.info("SendMessage " + msg);
        if (sendreply) {
            this.channel.sendToQueue(queue, Buffer.from(msg), { correlationId: correlationId, replyTo: this._ok.queue });
        } else {
            this.channel.sendToQueue(queue, Buffer.from(msg), { correlationId: correlationId });
        }
    }
    generateUuid(): string {
        return Math.random().toString() +
            Math.random().toString() +
            Math.random().toString();
    }


}

type RPCCallback = (msg: string) => string;


// tslint:disable-next-line: class-name
export class amqp_rpc_consumer {
    conn: amqplib.Connection;
    channel: amqplib.Channel; // channel: amqplib.ConfirmChannel;
    queue: string;
    callback: RPCCallback;
    private _logger: winston.Logger;
    private _ok: amqplib.Replies.AssertQueue;
    private connectionstring: string;

    constructor(logger: winston.Logger, connectionstring: string, queue: string, callback: RPCCallback) {
        this._logger = logger;
        this.queue = queue;
        this.callback = callback;
        this.connectionstring = connectionstring;
    }
    async connect(): Promise<void> {
        var me: amqp_rpc_consumer = this;
        this.conn = await amqplib.connect(this.connectionstring);
        this.channel = await this.conn.createChannel();
        this._ok = await this.channel.assertQueue(this.queue, { durable: false });
        await this.channel.consume(this.queue, (msg) => { this.OnMessage(me, msg); }, { noAck: false });
        this._logger.info("Connected to " + new URL(this.connectionstring).hostname);
    }
    async close(): Promise<void> {
        if (this.channel != null && this.channel != undefined) { await this.channel.close(); this.channel = null; }
        if (this.conn != null && this.conn != undefined) { await this.conn.close(); this.conn = null; }
    }
    OnMessage(sender: amqp_rpc_consumer, msg: amqplib.ConsumeMessage): void {
        sender._logger.info("OnMessage " + msg.content.toString());
        var result: string = this.callback(msg.content.toString());
        this.channel.sendToQueue(msg.properties.replyTo, Buffer.from(result), { correlationId: msg.properties.correlationId });
        this.channel.ack(msg);
    }

}