'use strict';

/**
 * Minimal scripted SMTP server for send queue tests (no dependency, loopback
 * only, synthetic addresses). The behaviour is chosen per message by the
 * local part of the first RCPT address:
 *
 *   ok@...          250 after the final dot (accepted)
 *   r451@...        451 after the final dot (refused, transient)
 *   r550@...        550 at RCPT (refused, permanent)
 *   r421@...        421 at RCPT, then the server closes (transient)
 *   dropbefore@...  closes the socket when DATA arrives (before 354)
 *   dropafter@...   closes the socket after the final dot without a reply
 *   hang@...        never answers the final dot (until the client gives up)
 *   t<N>@...        451 after the dot for the first N deliveries of the same
 *                   outbox id, then 250
 *
 * Every complete message (final dot received) is recorded with its
 * X-MagicMail-Outbox header and whether it was accepted.
 */

const net = require('node:net');

/**
 * @param {{port?: number, host?: string}} [options]
 * @returns {Promise<{port: number, received: Array<{outboxId: string|null, accepted: boolean, messageId: string|null}>, refuseConnections: (on: boolean) => void, close: () => Promise<void>}>}
 */
function startFakeSmtp({ port = 0, host = '127.0.0.1' } = {}) {
  const received = [];
  const seenPerOutbox = new Map();
  let refusing = false;
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    if (refusing) {
      socket.destroy();
      return;
    }
    socket.write('220 fake.example.test ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let mode = 'ok';
    let message = [];
    let acceptedRecipients = 0;

    const finishData = () => {
      const text = message.join('\r\n');
      const outboxMatch = /^X-MagicMail-Outbox:\s*([A-Za-z0-9]+)/im.exec(text);
      const messageIdMatch = /^Message-ID:\s*(<[^>]+>)/im.exec(text);
      const outboxId = outboxMatch ? outboxMatch[1] : null;
      const messageId = messageIdMatch ? messageIdMatch[1] : null;
      const seen = (seenPerOutbox.get(outboxId) || 0) + 1;
      seenPerOutbox.set(outboxId, seen);
      let accepted = false;
      const failFirst = /^t(\d+)$/.exec(mode);
      if (mode === 'dropafter') {
        received.push({ outboxId, accepted: false, messageId, mode });
        socket.destroy();
        return;
      }
      if (mode === 'hang') {
        received.push({ outboxId, accepted: false, messageId, mode });
        return;
      }
      if (mode === 'r451' || (failFirst && seen <= Number(failFirst[1]))) {
        socket.write('451 4.3.0 try again later\r\n');
      } else {
        accepted = true;
        socket.write('250 2.0.0 queued\r\n');
      }
      received.push({ outboxId, accepted, messageId, mode });
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            finishData();
            if (socket.destroyed) return;
          } else {
            message.push(line.startsWith('..') ? line.slice(1) : line);
          }
          continue;
        }
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') {
          socket.write('250-fake.example.test\r\n250-PIPELINING\r\n250 8BITMIME\r\n');
        } else if (verb === 'MAIL') {
          socket.write('250 2.1.0 ok\r\n');
        } else if (verb === 'RCPT') {
          const local = (/<([^@>]+)@/.exec(line) || [])[1] || 'ok';
          if (mode === 'ok' && message.length === 0) mode = local.toLowerCase();
          if (mode === 'r550') socket.write('550 5.1.1 no such user\r\n');
          else if (mode === 'r421') {
            socket.write('421 4.7.0 closing\r\n');
            socket.end();
            return;
          } else {
            acceptedRecipients += 1;
            socket.write('250 2.1.5 ok\r\n');
          }
        } else if (verb === 'DATA') {
          // RFC 2920: with every RCPT refused, DATA is refused too.
          if (acceptedRecipients === 0) {
            socket.write('554 5.5.1 no valid recipients\r\n');
            continue;
          }
          if (mode === 'dropbefore') {
            socket.destroy();
            return;
          }
          inData = true;
          message = [];
          socket.write('354 end with .\r\n');
        } else if (verb === 'RSET') {
          mode = 'ok';
          acceptedRecipients = 0;
          socket.write('250 ok\r\n');
        } else if (verb === 'QUIT') {
          socket.end('221 bye\r\n');
          return;
        } else {
          socket.write('250 ok\r\n');
        }
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        received,
        refuseConnections(on) {
          refusing = Boolean(on);
        },
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

module.exports = { startFakeSmtp };
