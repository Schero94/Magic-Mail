# Delivery webhook fixtures

Provider sample payloads used by `tests/webhook-outcomes.test.js`. Retrieved on
2026-11-17. No provider was called with credentials.

## `sendgrid-events.json`

One event object per key, copied from the JSON examples on the Twilio SendGrid
Event Webhook reference:
<https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event>

| Key                 | Example on that page                                    |
| ------------------- | ------------------------------------------------------- |
| `bounce`            | "Example bounced event webhook response"                |
| `blocked`           | "Example webhook response for blocked events"           |
| `delivered`         | "Example delivered event webhook response"              |
| `deferred`          | "Example deferred event webhook response"               |
| `dropped`           | "Example dropped event webhook response"                |
| `spamreport`        | "Example webhook response for spam report events"       |
| `unsubscribe`       | "Example webhook response for unsubscribe events"       |
| `group_unsubscribe` | "Example webhook response for group unsubscribe events" |
| `group_resubscribe` | "Example webhook response for group resubscribe events" |

The dropped `reason` values the tests iterate over are the list in the "Dropped"
section of the same page. Custom arguments (`custom_args`) appear as top-level
keys of each event ("Unique and custom arguments" on the same page), which is
where `magicmail_id` is read from. The page says delayed or asynchronous bounces
carry no `sg_message_id`; the async-bounce case in the tests is the official
bounce example with that field removed.

Notes:

- The official examples reuse one `sg_event_id` for the bounce and blocked
  samples and one `sg_message_id` for all samples. Tests override ids where a
  case needs distinct events.
- The deferred example has a leading space in `sg_message_id`; it is kept.

## `mailgun-events.json`

`event-data` objects copied from the official Mailgun API bundle
<https://documentation.mailgun.com/_bundle/docs/mailgun/api-reference/send/mailgun.json>,
`GET /v3/{domain_name}/events`, 200 response examples `Failed`, `Delivered`,
`Complained` and `Unsubscribed` (`items[0]`). Event types and their meaning:
<https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks>.
`EventSeverityType` (`temporary` = Mailgun retries, `permanent` = no retry)
comes from the same bundle. A webhook POST wraps one `event-data` object next
to a `signature` object (`timestamp`, `token`, `signature`), see
<https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks>.

The bundle has no `temporary` failure example. The tests build one from the
`Failed` example with `severity: "temporary"`. User variables sent as
`v:magicmail_id` arrive in `user-variables`.

## Synthetic data

Real-looking addresses and IPs in the samples were replaced: every mailbox is
`*@example.test` (message-id local parts were kept, their host became
`mg.example.test`), IPs are from 192.0.2.0/24. Nothing else was changed.

The SendGrid signature known-answer test (`PUBLIC_KEY`, `SIGNATURE`,
`TIMESTAMP` 1600112502 and the payload ending in `\r\n`) is copied byte for byte
from the official sendgrid-nodejs test suite
(<https://github.com/sendgrid/sendgrid-nodejs/blob/498e2329e87d804d83f4a7b519d33fa09198d0ca/packages/eventwebhook/src/eventwebhook.spec.js>).
It keeps SendGrid's sample address, because changing a byte would break the
signature.
