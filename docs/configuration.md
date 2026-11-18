# Configuration and running several instances

Environment variables, every plugin config key, the admin settings, account fields, the service API, and what several Strapi instances on one database need.

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). Start with the [README](https://github.com/Schero94/Magic-Mail#readme) for install and quick start.

- [Configuration reference](#configuration-reference)
- [Running several instances (Railway replicas, pm2 cluster)](#running-several-instances-railway-replicas-pm2-cluster)

## Configuration reference

### Environment variables

| Variable                              | Required                                                 | Purpose                                                                         |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MAGIC_MAIL_ENCRYPTION_KEY`           | yes, unless `NODE_ENV` is unset, `development` or `test` | Credential encryption key (32+ bytes). Keep it stable and backed up             |
| `MAGIC_MAIL_ENCRYPTION_KEY_PREVIOUS`  | no                                                       | Previous key during a rotation (decrypt only; saving an account re-encrypts it) |
| `MAGIC_MAIL_OAUTH_STATE_SECRET`       | no                                                       | OAuth state signing secret (default: derived from the encryption key)           |
| `MAGIC_MAIL_TRACKING_SECRET`          | no                                                       | Tracking hash secret (default: derived from the encryption key)                 |
| `MAGIC_MAIL_TRACKING_SECRET_PREVIOUS` | no                                                       | Comma-separated old tracking secrets that stay valid                            |
| `URL`                                 | no                                                       | Legacy override of the OAuth callback base URL (default: `server.url`)          |
| `MAGIC_MAIL_ENABLE_DEBUG_ENDPOINT`    | no                                                       | `true` enables `GET /magic-mail/analytics/debug` outside production             |

Without `MAGIC_MAIL_ENCRYPTION_KEY`, a development key derived from `ADMIN_JWT_SECRET`/`APP_KEYS` is used only when `NODE_ENV` is unset, `development` or `test`; rotating those secrets then makes stored credentials unreadable. Any other environment (for example `staging`) refuses to start without the key.

Also set Strapi's `server.url` to your public URL (OAuth redirects, tracking links) and `server.proxy.koa: true` behind a reverse proxy.

### Plugin config

All keys are optional and validated at startup (an invalid value stops Strapi with a clear message):

```javascript
// config/plugins.js
module.exports = () => ({
  'magic-mail': {
    enabled: true,
    config: {
      debug: false, // info/debug logs; warnings and errors are always logged
      contentApi: {
        allowUserRoles: false, // true = users-permissions roles may use the send routes
      },
      quotaTimezone: 'UTC', // IANA zone for hourly/daily quota windows
      tracking: {
        eventRetentionDays: 90, // raw open/click events; 0 = keep forever
        linkTtlDays: 180, // tracked links redirect this long; 0 = forever
        logRetentionDays: 0, // email logs (with events and links); 0 = keep forever
        maxLinksPerEmail: 100, // further links stay untracked
        allowedLinkHosts: [], // e.g. ['example.com'] (subdomains included)
        anonymizeIp: true, // store /24 (IPv4) or /48 (IPv6) only
      },
      designer: {
        projectId: null, // optional Unlayer project id
        scriptUrl: null, // optional https URL of the Unlayer loader
        version: null, // optional exact Unlayer build
      },
      rateLimit: {
        store: 'database', // 'database' (shared by all instances), 'redis' or 'memory'
        // redis: new Redis(process.env.REDIS_URL), // ioredis or node-redis v4+ client, store: 'redis'
        redisPrefix: 'magic-mail:rl:',
      },
      queue: {
        worker: true, // see "Retries and the outbox" for every key
      },
      webhooks: {
        maxBodyBytes: 1024 * 1024, // largest delivery-webhook body, 64 KiB to 5 MiB
        suppressComplaints: false, // also suppress spam complainers
      },
    },
  },
});
```

| Key                           | Type                                | Default                                                   | Effect                                                                                              |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `debug`                       | boolean                             | `false`                                                   | Info and debug logs; warnings and errors are always logged                                          |
| `contentApi.allowUserRoles`   | boolean                             | `false`                                                   | Let users-permissions roles call the Content API send routes                                        |
| `quotaTimezone`               | IANA zone                           | `'UTC'`                                                   | Time zone of the hourly and daily quota windows                                                     |
| `tracking.eventRetentionDays` | integer >= 0                        | `90`                                                      | Delete open and click events after this many days (0 = keep)                                        |
| `tracking.linkTtlDays`        | integer >= 0                        | `180`                                                     | Tracked links redirect this long (0 = forever)                                                      |
| `tracking.logRetentionDays`   | integer >= 0                        | `0`                                                       | Delete email logs with their events and links (0 = keep)                                            |
| `tracking.maxLinksPerEmail`   | integer >= 0                        | `100`                                                     | Further links stay untracked                                                                        |
| `tracking.allowedLinkHosts`   | string[]                            | `[]`                                                      | Hosts that may be click-tracked (see below)                                                         |
| `tracking.anonymizeIp`        | boolean                             | `true`                                                    | Store IPs truncated to /24 (IPv4) or /48 (IPv6)                                                     |
| `designer.projectId`          | positive integer or `null`          | `null`                                                    | Your own Unlayer project id                                                                         |
| `designer.scriptUrl`          | https URL or `null`                 | `null`                                                    | Self-hosted Unlayer `embed.js`                                                                      |
| `designer.version`            | string or `null`                    | `null`                                                    | Exact Unlayer build                                                                                 |
| `rateLimit.store`             | `'database'`, `'redis'`, `'memory'` | `'database'`                                              | Where rate-limit counters live ([details](#running-several-instances-railway-replicas-pm2-cluster)) |
| `rateLimit.redis`             | Redis client                        | none                                                      | ioredis or node-redis v4+ client for `store: 'redis'`                                               |
| `rateLimit.redisPrefix`       | string                              | `'magic-mail:rl:'`                                        | Key prefix in Redis                                                                                 |
| `queue.*`                     | object                              | see [Retries and the outbox](./delivery.md#configuration) | Outbox worker, retries, limits and retention                                                        |
| `webhooks.maxBodyBytes`       | integer, 65536 to 5242880           | `1048576` (1 MiB)                                         | Largest SendGrid/Mailgun webhook body; larger requests get `413`. SendGrid batches reach 768 KB     |
| `webhooks.suppressComplaints` | boolean                             | `false`                                                   | Also add spam complaints to the suppression list (needs **Block hard-bounced recipients**)          |

`allowedLinkHosts` empty means: every host may be click-tracked for admin, service and native sends, and **no** host for Content-API sends. When the list is set, it applies to all sends.

### Admin settings

**Settings → MagicMail → Plugin Settings**, stored in the database (`GET`/`PUT /magic-mail/settings`):

| Setting                         | Default   | Effect                                                                                                                                   |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Link tracking / Open tracking   | on        | Rewrite links / add the open pixel                                                                                                       |
| Count provider opens and clicks | off       | Provider templates: the provider tracks opens and clicks and its events are counted ([details](./delivery.md#provider-opens-and-clicks)) |
| Tracking base URL               | empty     | Public base for tracking URLs (else `server.url`)                                                                                        |
| Default from name               | empty     | Display name when neither the account nor the caller sets one                                                                            |
| Default from email              | empty     | Reference only; emails always go out from the selected account's address                                                                 |
| Unsubscribe header              | on        | Send `List-Unsubscribe` for every email type and use the plugin-wide URL                                                                 |
| Unsubscribe URL                 | empty     | Plugin-wide unsubscribe URL; `{{email}}` is replaced per recipient                                                                       |
| `trackingFallbackUrl` (API)     | empty     | Where expired or unknown tracking links redirect; empty shows a static page                                                              |
| Queue failed sends              | off       | Store sends that failed after failover and retry them ([details](./delivery.md#retries-and-the-outbox))                                  |
| Retries per mail                | 3         | Retries after the first try, 1 to 10                                                                                                     |
| Check recipient domains         | on        | Reject typo and reserved test domains ([details](./delivery.md#recipient-checks-before-sending))                                         |
| Test domains                    | automatic | Automatic: allowed outside production, rejected in production; or always allow / reject                                                  |
| Look up mail servers (MX)       | off       | Reject domains without a mail server                                                                                                     |
| Block hard-bounced recipients   | off       | Reject sends to addresses on the suppression list                                                                                        |
| Bounce check interval           | 5         | Minutes between mailbox checks, 1 to 60 ([details](./delivery.md#bounce-monitoring-mailbox))                                             |

### Account fields

Name (unique), description, provider, from email and name, reply-to, encrypted credentials (SMTP password, API key, OAuth tokens, optional DKIM key), daily and hourly limit (0 = unlimited), priority (1 to 10, higher preferred), active and primary flags.

Provider config keys (`config`, encrypted; secrets come back as `********`):

| Provider   | Keys                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brevo      | `apiKey` (secret), `webhookToken` (secret, created by MagicMail; shown only through `POST /accounts/:accountId/webhook-token`)                                                                                                                                                                                             |
| Amazon SES | `region` (for example `eu-west-1`), `credentialSource` (`keys` or `environment`), `accessKeyId`, `secretAccessKey` (secret; both empty with `environment`), `configurationSetName` (optional), `snsTopicArn` (optional, required for the webhook). Changing `accessKeyId` or `credentialSource` requires the secret again. |

### Service API

```javascript
const router = strapi.plugin('magic-mail').service('email-router');
await router.send({ to, subject, html });

const accounts = await strapi.plugin('magic-mail').service('account-manager').getAllAccounts();

// Test one account (also works for inactive accounts)
await strapi
  .plugin('magic-mail')
  .service('account-manager')
  .testAccount(accountDocumentId, 'you@example.com', { priority: 'high', type: 'marketing' });

const designer = strapi.plugin('magic-mail').service('email-designer');
const rendered = await designer.renderTemplate(100, { user: { firstName: 'Ada' } });
const stats = await designer.getStats(); // { total, active, inactive, byCategory, ... }
```

## Running several instances (Railway replicas, pm2 cluster)

MagicMail works with several Node processes that share one database, for example 2 Railway replicas with `pm2 -i 4` each (8 processes) on one PostgreSQL. No sticky sessions and no Redis are required: everything that has to be consistent across processes lives in the database.

### What is shared and how

| Concern                                                         | How it is kept correct across processes                                                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account hourly/daily quotas                                     | One conditional `UPDATE ... WHERE count < limit` per send. Windows only move forward, so a replica whose clock lags a little never resets a window another one opened.                                 |
| Rate limits (send, test send, webhooks, tracking)               | Fixed-window counters in `magic_mail_rate_limits`, one atomic upsert (`INSERT ... ON CONFLICT DO UPDATE`). Tracking routes only touch the database after a caller's first `max / 10` hits per process. |
| OAuth flows (state, PKCE verifier)                              | One row per flow in `magic_mail_oauth_pending`; the callback consumes it with one conditional `DELETE`, so a duplicated callback can not be accepted twice.                                            |
| OAuth token refresh                                             | One refresh per account at a time (database lease). Other processes wait briefly and then use the stored, refreshed token; a rotated refresh token is never overwritten by an older one.               |
| Bounce and complaint webhooks                                   | A provider retry that reaches another process while the first one still works is acknowledged without work (claim row in `magic_mail_claims`, primary key). Listeners run once per event.              |
| Open and click counters                                         | Single `UPDATE ... SET count = count + 1`, no read-modify-write.                                                                                                                                       |
| Template version numbers, primary account, unique names         | Written under a short database lease, so two admins saving at the same moment on different instances get distinct version numbers and one primary account.                                             |
| Users & Permissions email templates, plugin flags               | Compare-and-set update of the core-store row; concurrent saves of the reset-password and confirmation templates keep both changes.                                                                     |
| Background jobs (quota refresh, retention, one-time migrations) | Every process keeps its timers, but each run takes a database lease, so one process does the work per interval. If it dies, another one takes over on its next tick.                                   |
| Plugin settings cache                                           | Cached for 10 seconds per process and re-checked against the row's `updated_at` about once a second, so a change made on one instance applies everywhere within about a second.                        |

The three coordination tables (`magic_mail_claims`, `magic_mail_rate_limits`, `magic_mail_oauth_pending`) are created at startup with plain `CREATE TABLE` and work on PostgreSQL, MySQL and SQLite. Strapi does not touch tables it did not create. Expired rows are removed every five minutes.

### Required configuration

1. **One database for all processes.** Point every replica at the same PostgreSQL (`DATABASE_URL` or `DATABASE_HOST` and friends). SQLite only works for several processes on one machine and one file. MySQL uses the same portable SQL but has not been load-tested with several processes yet.
   - The database user needs the `CREATE TABLE` right Strapi already uses (for the three coordination tables).
   - Every process opens its own connection pool. Keep `processes x pool.max` (`connection.pool` in `config/database.js`) below the server's `max_connections`; for 8 processes on a small Railway PostgreSQL, a `pool: { min: 0, max: 5 }` is a safe start.
2. **Identical secrets everywhere.** Set these as Railway _shared variables_ (or one `.env` used by every pm2 worker):

   ```bash
   NODE_ENV=production
   APP_KEYS=...                       # same value and order on every replica
   MAGIC_MAIL_ENCRYPTION_KEY=...      # credentials encrypted on one replica are read on another
   MAGIC_MAIL_TRACKING_SECRET=...     # tracking links signed on one replica are verified on another
   MAGIC_MAIL_OAUTH_STATE_SECRET=...  # OAuth state signed on one replica is verified on another
   ```

   At startup every process logs `[magic-mail] Secret fingerprints (must match on every instance): encryption=… tracking=… oauthState=…`. The values are short one-way fingerprints; if two instances print different values, their secrets differ.

3. **Real client IPs behind the proxy.** Railway, Render, Fly and load balancers forward the client address in `X-Forwarded-For`. Without `proxy`, every unauthenticated caller shares the proxy's address and therefore one rate-limit quota:

   ```javascript
   // config/server.js
   module.exports = ({ env }) => ({
     host: env('HOST', '0.0.0.0'),
     port: env.int('PORT', 1337),
     url: env('PUBLIC_URL'), // public https URL (OAuth redirects, tracking links)
     proxy: { koa: true },
     app: { keys: env.array('APP_KEYS') },
   });
   ```

4. **pm2 cluster mode.** No sticky sessions are needed. pm2's cluster mode runs a Node.js script, so point it at the Strapi CLI instead of `npm`. Example `ecosystem.config.js`:

   ```javascript
   module.exports = {
     apps: [
       {
         name: 'strapi',
         script: './node_modules/@strapi/strapi/bin/strapi.js',
         args: 'start',
         exec_mode: 'cluster',
         instances: 4,
         env: { NODE_ENV: 'production' },
       },
     ],
   };
   ```

   In a container (Railway, Docker) start it in the foreground with `pm2-runtime start ecosystem.config.js` as the start command. All workers of one replica share its `PORT`; pm2 spreads the requests over them.

5. **Railway replicas.** Set the replica count in the service settings (for example 2). Every replica runs the same start command and gets the same variables, so with `instances: 4` you get 8 processes. Railway's proxy balances requests across replicas without stickiness, which MagicMail does not need.

   On a **brand-new, empty database**, deploy with one replica first. Strapi itself creates its system tables (`strapi_migrations`, ...) at the first boot, and several processes doing that at the same moment can crash with `duplicate key value violates unique constraint "pg_class_relname_nsp_index"`. This is Strapi core, not MagicMail; a restart fixes it. Once the schema exists, scale up.

6. **Optional: Redis for the rate limiter.** The database store is enough for most installs. If you already run Redis, create the client yourself and pass it in; on a Redis error the database store is used:

   ```javascript
   // config/plugins.js
   const Redis = require('ioredis');

   module.exports = ({ env }) => ({
     'magic-mail': {
       config: {
         rateLimit: env('REDIS_URL')
           ? { store: 'redis', redis: new Redis(env('REDIS_URL')) }
           : { store: 'database' },
       },
     },
   });
   ```

   `rateLimit.store: 'memory'` restores the per-process limiter of earlier versions (single instance only).

### Limits

- A process that crashes between reserving a quota slot and sending keeps that slot used until the window ends.
- Rate limits are fixed windows, so a caller can send up to twice the limit across a window boundary. Up to `max / 10 - 1` tracking hits per process and window may go uncounted.
- Changing `quotaTimezone` to a zone that is behind the old one keeps counting in the old window until the new zone catches up (stricter, never looser).
- Unique account names, rule names and template reference ids are enforced by the application under a lease, not by a database index. Duplicates created by earlier versions stay until you rename them.
- Content-API sends that fail because the account quota is used up or the `accountName` is unknown return 500 "Failed to send email", as in earlier versions.
- Strapi's own Users & Permissions settings page still writes its email templates without compare-and-set; a save there at the same moment as a MagicMail save can still win.

### Testing it

`npm run test:multi-instance` starts 8 processes against one SQLite file and checks the invariants above (one claim winner, no lost updates, shared rate-limit counts, each OAuth flow consumed once, compare-and-set store writes, atomic counters, quota limits). Set `MAGIC_MAIL_TEST_PG_URL=postgres://user@host:5432/throwaway_db` to run the same suite against PostgreSQL. The same command runs the outbox proof: 8 processes, 500 queued mails against a local scripted SMTP server, each accepted exactly once, retries bounded, uncertain mails never re-sent, one row per idempotency key, racing admin actions and `SIGKILL` during claim and dispatch.
