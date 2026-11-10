'use strict';

/**
 * Minimal IMAP4rev1 server for tests (plain TCP, one mailbox). Implements
 * what imapflow uses for bounce monitoring: CAPABILITY, LOGIN, SELECT/EXAMINE,
 * UID SEARCH (ALL, SINCE, UID range), UID FETCH (UID, ENVELOPE, RFC822.SIZE,
 * BODY.PEEK[HEADER.FIELDS (...)], BODY.PEEK[] with partial), CREATE, UID MOVE,
 * NOOP, LOGOUT. Synthetic data only; never exposed outside 127.0.0.1.
 */

const net = require('node:net');
const tls = require('node:tls');

const quote = (value) =>
  value === null || value === undefined
    ? 'NIL'
    : `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** @param {string} raw @param {string} name */
function header(raw, name) {
  const head = raw.split(/\r?\n\r?\n/)[0];
  const match = head.match(new RegExp(`^${name}:([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, 'im'));
  return match ? match[1].replace(/\r?\n[ \t]/g, ' ').trim() : '';
}

function addressList(value) {
  const match = String(value || '').match(/<?([^<>\s@]+)@([^<>\s]+?)>?\s*$/);
  if (!match) return 'NIL';
  const name =
    String(value)
      .replace(/<[^>]*>/, '')
      .trim()
      .replace(/^"|"$/g, '') || null;
  return `((${quote(name)} NIL ${quote(match[1])} ${quote(match[2])}))`;
}

function envelope(raw) {
  const from = addressList(header(raw, 'from'));
  return `(${quote(header(raw, 'date') || null)} ${quote(header(raw, 'subject') || null)} ${from} ${from} ${from} ${addressList(header(raw, 'to'))} NIL NIL NIL ${quote(header(raw, 'message-id') || null)})`;
}

/**
 * Starts the server.
 *
 * @param {{user?: string, pass?: string, uidValidity?: number, gmail?: boolean,
 *   port?: number, tls?: {key: string|Buffer, cert: string|Buffer}}} [options]
 *   `tls`: implicit TLS (IMAPS) with the given key and certificate.
 * @returns {Promise<{port: number, close: Function, add: (raw: string) => number,
 *   messages: Array<{uid: number, raw: string, folder: string}>, logins: number, failedLogins: number}>}
 */
async function startFakeImap({
  user = 'bounces@sender.example',
  pass = 'synthetic-pass',
  uidValidity = 7,
  gmail = false,
  port = 0,
  tls: tlsOptions = null,
} = {}) {
  const state = {
    messages: [],
    nextUid: 1,
    logins: 0,
    failedLogins: 0,
    folders: new Set(['INBOX']),
    commands: [],
  };

  const onConnection = (socket) => {
    let buffer = '';
    let selected = null;
    const send = (line) => socket.write(`${line}\r\n`);
    const inFolder = () => state.messages.filter((m) => m.folder === selected);
    send('* OK [CAPABILITY IMAP4rev1 UIDPLUS MOVE] Fake IMAP ready');

    const handle = (line) => {
      const match = line.match(/^(\S+)\s+(.*)$/);
      if (!match) return;
      const [, tag, rest] = match;
      const upper = rest.toUpperCase();
      state.commands.push(upper.split(' ')[0]);
      if (upper.startsWith('CAPABILITY')) {
        send(`* CAPABILITY IMAP4rev1 UIDPLUS MOVE${gmail ? ' X-GM-EXT-1' : ''}`);
        return send(`${tag} OK CAPABILITY completed`);
      }
      if (upper.startsWith('LOGIN') || upper.startsWith('AUTHENTICATE')) {
        let ok = false;
        if (upper.startsWith('LOGIN')) {
          const args = rest.slice(6).match(/("(?:[^"\\]|\\.)*"|\S+)/g) || [];
          const unq = (s) => (s || '').replace(/^"|"$/g, '').replace(/\\(.)/g, '$1');
          ok = unq(args[0]) === user && unq(args[1]) === pass;
        }
        if (ok) {
          state.logins += 1;
          return send(
            `${tag} OK [CAPABILITY IMAP4rev1 UIDPLUS MOVE${gmail ? ' X-GM-EXT-1' : ''}] Logged in`
          );
        }
        state.failedLogins += 1;
        return send(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials`);
      }
      if (upper.startsWith('SELECT') || upper.startsWith('EXAMINE')) {
        const name = rest
          .slice(rest.indexOf(' ') + 1)
          .trim()
          .replace(/^"|"$/g, '');
        if (!state.folders.has(name)) return send(`${tag} NO [NONEXISTENT] No such mailbox`);
        selected = name;
        send('* FLAGS (\\Seen \\Deleted)');
        send(`* ${inFolder().length} EXISTS`);
        send(`* OK [UIDVALIDITY ${uidValidity}] UIDs valid`);
        send(`* OK [UIDNEXT ${state.nextUid}] Predicted next UID`);
        return send(
          `${tag} OK [${upper.startsWith('SELECT') ? 'READ-WRITE' : 'READ-ONLY'}] Selected`
        );
      }
      if (upper.startsWith('UID SEARCH')) {
        const criteria = rest.slice(11);
        let list = inFolder().map((m) => m.uid);
        const range = criteria.match(/UID\s+(\d+):(\*|\d+)/i);
        if (range) {
          const from = Number(range[1]);
          const to = range[2] === '*' ? Infinity : Number(range[2]);
          list = list.filter((uid) => uid >= from && uid <= to);
          if (!list.length && inFolder().length) list = [inFolder()[inFolder().length - 1].uid];
        }
        if (/X-GM-RAW/i.test(criteria)) {
          list = inFolder()
            .filter((m) => /mailer-daemon|postmaster/i.test(header(m.raw, 'from')))
            .map((m) => m.uid);
        }
        send(`* SEARCH${list.length ? ` ${list.join(' ')}` : ''}`);
        return send(`${tag} OK SEARCH completed`);
      }
      if (upper.startsWith('UID FETCH')) {
        const parts = rest.match(/^UID FETCH\s+(\S+)\s+\((.*)\)\s*$/i);
        if (!parts) return send(`${tag} BAD Bad fetch`);
        const uids = new Set();
        for (const piece of parts[1].split(',')) {
          const [a, b] = piece.split(':');
          const from = Number(a);
          const to = b === undefined ? from : b === '*' ? Infinity : Number(b);
          for (const m of inFolder()) if (m.uid >= from && m.uid <= to) uids.add(m.uid);
        }
        const items = parts[2].toUpperCase();
        for (const [seqIndex, m] of inFolder().entries()) {
          if (!uids.has(m.uid)) continue;
          const fields = [`UID ${m.uid}`];
          if (items.includes('RFC822.SIZE')) fields.push(`RFC822.SIZE ${Buffer.byteLength(m.raw)}`);
          if (items.includes('ENVELOPE')) fields.push(`ENVELOPE ${envelope(m.raw)}`);
          let literal = null;
          const fieldsMatch = items.match(/BODY\.PEEK\[HEADER\.FIELDS \(([^)]*)\)\]/);
          if (fieldsMatch) {
            const names = fieldsMatch[1].split(/\s+/).filter(Boolean);
            const text = names
              .map((n) => {
                const v = header(m.raw, n.toLowerCase());
                return v ? `${n}: ${v}\r\n` : '';
              })
              .join('')
              .concat('\r\n');
            literal = { key: `BODY[HEADER.FIELDS (${names.join(' ')})]`, text };
          } else if (/BODY\.PEEK\[\]/.test(items)) {
            const partial = items.match(/BODY\.PEEK\[\]<(\d+)\.(\d+)>/);
            const raw = m.raw.replace(/\r?\n/g, '\r\n');
            const start = partial ? Number(partial[1]) : 0;
            const text = partial ? raw.slice(start, start + Number(partial[2])) : raw;
            literal = { key: partial ? `BODY[]<${start}>` : 'BODY[]', text };
          }
          if (literal) {
            socket.write(
              `* ${seqIndex + 1} FETCH (${fields.join(' ')} ${literal.key} {${Buffer.byteLength(literal.text)}}\r\n${literal.text})\r\n`
            );
          } else {
            send(`* ${seqIndex + 1} FETCH (${fields.join(' ')})`);
          }
        }
        return send(`${tag} OK FETCH completed`);
      }
      if (upper.startsWith('CREATE')) {
        const name = rest.slice(7).trim().replace(/^"|"$/g, '');
        state.folders.add(name);
        return send(`${tag} OK CREATE completed`);
      }
      if (upper.startsWith('LIST')) {
        // LIST "" "" asks only for the hierarchy delimiter (RFC 3501 6.3.8).
        if (/^LIST\s+""\s+""\s*$/i.test(rest)) {
          send('* LIST (\\Noselect) "/" ""');
          return send(`${tag} OK LIST completed`);
        }
        send('* LIST (\\HasNoChildren) "/" "INBOX"');
        for (const f of state.folders)
          if (f !== 'INBOX') send(`* LIST (\\HasNoChildren) "/" ${quote(f)}`);
        return send(`${tag} OK LIST completed`);
      }
      if (upper.startsWith('UID MOVE')) {
        const parts = rest.match(/^UID MOVE\s+(\S+)\s+(.+)$/i);
        const target = parts[2].trim().replace(/^"|"$/g, '');
        const wanted = new Set(parts[1].split(',').map(Number));
        for (const m of state.messages)
          if (m.folder === selected && wanted.has(m.uid)) m.folder = target;
        return send(`${tag} OK MOVE completed`);
      }
      if (upper.startsWith('LOGOUT')) {
        send('* BYE Logging out');
        send(`${tag} OK LOGOUT completed`);
        return socket.end();
      }
      if (upper.startsWith('CLOSE') || upper.startsWith('UNSELECT')) {
        selected = null;
        return send(`${tag} OK done`);
      }
      return send(`${tag} OK done`);
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index;
      while ((index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        handle(line);
      }
    });
    socket.on('error', () => {});
  };
  const server = tlsOptions
    ? tls.createServer(tlsOptions, onConnection)
    : net.createServer(onConnection);

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    get messages() {
      return state.messages;
    },
    get logins() {
      return state.logins;
    },
    get failedLogins() {
      return state.failedLogins;
    },
    get commands() {
      return state.commands;
    },
    add(raw, folder = 'INBOX') {
      const uid = state.nextUid;
      state.nextUid += 1;
      state.messages.push({ uid, raw, folder });
      return uid;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startFakeImap };
