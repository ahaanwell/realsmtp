const SMTPConnection = require("nodemailer/lib/smtp-connection");
const MailComposer = require("nodemailer/lib/mail-composer");

// Keeps one SMTP connection logged in at all times, so sending a lead email
// skips the slow connect + TLS + login step (~1.5-2s on Hostinger).
class WarmMailer {
  constructor({ host, port, secure, auth, keepAliveMs = 45000 }) {
    this.options = { host, port, secure, auth, keepAliveMs };
    this.connection = null;
    this.connecting = null;
    this.busy = false;
    this.queue = [];
    this.keepAliveTimer = null;
    this.reconnectTimer = null;
  }

  start() {
    this._ensureConnected().catch((err) => console.error("Warm SMTP connect failed:", err.message));
  }

  _ensureConnected() {
    if (this.connection) return Promise.resolve(this.connection);
    if (this.connecting) return this.connecting;

    const { host, port, secure, auth } = this.options;
    this.connecting = new Promise((resolve, reject) => {
      const conn = new SMTPConnection({
        host,
        port,
        secure,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 120000,
      });
      let settled = false;
      const fail = (err) => {
        if (!settled) {
          settled = true;
          this.connecting = null;
          conn.close();
          this._scheduleReconnect(30000);
          reject(err);
        }
      };

      conn.on("error", (err) => {
        if (!settled) return fail(err);
        console.error("Warm SMTP connection error:", err.message);
      });
      conn.on("end", () => {
        if (this.connection === conn) {
          this.connection = null;
          this._scheduleReconnect(1000);
        }
      });

      conn.connect(() => {
        conn.login(auth, (err) => {
          if (err) return fail(err);
          settled = true;
          this.connection = conn;
          this.connecting = null;
          this._startKeepAlive();
          console.log("Warm SMTP connection ready");
          resolve(conn);
        });
      });
    });
    return this.connecting;
  }

  _scheduleReconnect(delayMs) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.start(), delayMs);
  }

  // Send RSET while idle so the server doesn't drop the connection
  _startKeepAlive() {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = setInterval(() => {
      if (!this.connection || this.busy) return;
      this.connection.reset((err) => {
        if (err) {
          console.error("Warm SMTP keep-alive failed, reconnecting:", err.message);
          this._drop();
        }
      });
    }, this.options.keepAliveMs);
  }

  _drop() {
    if (this.connection) {
      const conn = this.connection;
      this.connection = null;
      conn.close();
    }
    this._scheduleReconnect(1000);
  }

  // Send one email; emails are queued because one connection handles one at a time
  sendMail(mailOptions) {
    return new Promise((resolve, reject) => {
      this.queue.push({ mailOptions, resolve, reject });
      this._next();
    });
  }

  async _next() {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;
    const { mailOptions, resolve, reject } = this.queue.shift();
    try {
      resolve(await this._send(mailOptions));
    } catch (err) {
      reject(err);
    } finally {
      this.busy = false;
      this._next();
    }
  }

  async _send(mailOptions) {
    const conn = await this._ensureConnected();
    const mail = new MailComposer(mailOptions).compile();
    return new Promise((resolve, reject) => {
      conn.send(mail.getEnvelope(), mail.createReadStream(), (err, info) => {
        if (err) {
          // Connection may be broken; start fresh for the next email
          this._drop();
          return reject(err);
        }
        conn.reset(() => {});
        resolve(info);
      });
    });
  }
}

module.exports = WarmMailer;
