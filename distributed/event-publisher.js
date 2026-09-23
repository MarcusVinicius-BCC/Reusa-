const { connectAmqp } = require('./amqp');

/**
 * Publishes records saved by the transactional outbox.  The application never
 * waits for RabbitMQ to answer an HTTP request: a temporary broker outage only
 * leaves records pending, to be retried by flushPending().
 */
class EventPublisher {
  constructor({ url, exchange = 'reusa.events', logger = console }) {
    this.url = url;
    this.exchange = exchange;
    this.logger = logger;
    this.connection = null;
    this.channel = null;
    this.connecting = null;
  }

  enabled() {
    return Boolean(this.url);
  }

  async connect() {
    if (!this.enabled()) return false;
    if (this.channel) return true;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        this.connection = await connectAmqp(this.url);
        this.connection.on('error', () => this.reset());
        this.connection.on('close', () => this.reset());
        this.channel = await this.connection.createConfirmChannel();
        await this.channel.assertExchange(this.exchange, 'topic', { durable: true });
        return true;
      } catch (error) {
        this.logger.warn(`[events] RabbitMQ unavailable: ${error.message}`);
        this.reset();
        return false;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  reset() {
    this.channel = null;
    this.connection = null;
  }

  async publish(event) {
    if (!(await this.connect())) return false;
    try {
      this.channel.publish(this.exchange, event.type, Buffer.from(JSON.stringify(event)), {
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        messageId: event.id,
        timestamp: Date.now(),
        persistent: true,
        headers: { 'x-correlation-id': event.correlationId }
      });
      await this.channel.waitForConfirms();
      return true;
    } catch (error) {
      this.logger.warn(`[events] Could not publish ${event.id}: ${error.message}`);
      this.reset();
      return false;
    }
  }

  async close() {
    if (this.connection) await this.connection.close().catch(() => {});
    this.reset();
  }
}

module.exports = { EventPublisher };
