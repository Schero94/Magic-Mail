# Live checks for the SendGrid and Mailgun webhooks

Part of the [MagicMail documentation](https://schero94.github.io/Magic-Mail/). How the webhooks map events: [Bounces and complaints](./delivery.md#bounces-and-complaints).

The unit tests replay the providers' published sample events with locally
generated signatures. They cannot prove how your real SendGrid or Mailgun
account behaves. This page lists the checks you can run yourself against a
real account. MagicMail's maintainers have not run them; every step marked
**unverified** is not covered by the providers' official documentation, so
write down what you observe.

## Before you start

- Strapi must be reachable from the internet over https. A tunnel to a local
  instance is fine.
- The account in MagicMail has its key saved: SendGrid **Signed Event Webhook
  verification key**, Mailgun **HTTP webhook signing key**.
- Keep the Strapi log open. MagicMail logs one warning line per request when
  events match no email log (`N delivery event(s) matched no email log`); it
  never logs addresses.
- Use addresses on a domain you control. Do not send test bounces to other
  people's domains.

Webhook URLs (`<accountId>` is the account's id shown in the wizard; adjust
`/api` if you changed `api.rest.prefix`):

```text
https://<your-strapi>/api/magic-mail/webhooks/sendgrid/<accountId>
https://<your-strapi>/api/magic-mail/webhooks/mailgun/<accountId>
```

## 1. SendGrid "Test Your Integration"

Source: <https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook>.
The button sends "a JSON array of example events" that "will not include real
data from your mail send".

1. **Settings → Mail Settings → Webhook Settings → Event Webhooks**, open the
   webhook, set the **Post URL**, enable **Signed Event Webhook** and select
   the events listed in the README section "Bounces and complaints".
2. Click **Test Your Integration**.
3. Look at the response in your access log or reverse proxy log and write it
   down: `200` or `401`.
   - **Unverified:** the page does not say whether test posts are signed. A
     `401` here only means the test post failed the signature check. It does
     not prove that real events will fail.
   - `413` means the body was larger than `webhooks.maxBodyBytes`. It should
     not happen with the test post.
4. Expected in MagicMail: no email log changes, because the example ids match
   no mail you sent. With a `200`, the Strapi log may show the
   `matched no email log` warning.

## 2. Mailgun webhook test

**Unverified:** the official webhooks page
(<https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks>)
does not describe a test button. Some Mailgun dashboards offer one next to each
webhook. If yours does:

1. **Sending → Webhooks** for the sending domain, in the right region (US or
   EU). Add the URL for **Permanent Failure** and **Spam Complaints** (plus the
   optional events from the README).
2. Use the test action for one webhook and write down the response code.
3. Expected: `200` when the signing key in MagicMail matches the one in
   **Settings → API Security**, `401` otherwise. The test payload references no
   mail you sent, so no email log changes.

## 3. A real bounce, end to end

Neither SendGrid sandbox mode nor the providers' test buttons create real
delivery events (SendGrid: sandbox requests "will not generate events in either
Event Webhook or Email Activity",
<https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sandbox-mode>).
**Unverified:** whether Mailgun test mode (`o:testmode`) emits webhooks; the
official docs do not say. So this check sends real mail.

Setup:

- In MagicMail, **Plugin Settings → Bounces and recipient checks**: turn on
  **Block hard-bounced recipients**.
- Pick a mailbox that does not exist on a domain you control, for example
  `no-such-user@<your-domain>`. Make sure the domain's mail server rejects
  unknown users (most do; a catch-all mailbox accepts everything and will not
  bounce).
- Have a second, working mailbox on your domain for the cc check.

Steps:

1. Send one mail through the SendGrid (or Mailgun) account to the nonexistent
   mailbox, for example with the account's **Test** action or
   `strapi.plugin('magic-mail').service('email-router').send(...)`.
2. Wait for the bounce (usually under a minute; SendGrid batches events for up
   to about 30 seconds).
3. Check:
   - **Analytics → delivery log:** the mail shows **Bounced** with a code such
     as `SENDGRID_BOUNCE_500` or `MAILGUN_BOUNCE_550`.
   - **Analytics:** **Bounced** (`totalBounced`) is at least 1 and the bounce
     rate is above 0.
   - **Plugin Settings → Bounces and recipient checks:** the suppression list
     shows the masked address with source `sendgrid` or `mailgun`.
   - Sending to the same address again, through any account (also SMTP), fails
     with `MAGIC_MAIL_RECIPIENT_SUPPRESSED`.
4. Remove the entry from the suppression list when you are done.

Cc check (a bounce for one recipient must not mark the whole mail):

1. Send one mail with `to` = your working mailbox and `cc` = the nonexistent
   mailbox.
2. Expected after the bounce: the delivery log still shows **Sent** for the
   mail. The bounce is recorded as an email event with a masked address and
   `primary: false`. The cc address is on the suppression list, the `to`
   address is not.

Optional, when you enabled the extra events:

- **Delivered:** after a normal send, the email log gets `deliveryConfirmedAt`;
  `deliveredAt` stays the time the provider accepted the mail.
- **Unsubscribe (unverified for your account setup):** only sent when SendGrid
  subscription tracking or unsubscribe groups, or Mailgun unsubscribe tracking,
  are on. Clicking the provider's unsubscribe link should set `unsubscribed` on
  the email log. Unsubscribes never feed the suppression list.

## 4. Asynchronous SendGrid bounces

SendGrid documents that "delayed or asynchronous bounces" carry no
`sg_message_id`. MagicMail then looks for the `magicmail_id` custom argument
and the `smtp-id`.

- **Unverified:** whether SendGrid keeps custom arguments on such bounces. The
  event reference says custom arguments are added to webhook events in general
  and says nothing specific about asynchronous bounces.
- If such a bounce matches no email log, the Strapi log shows the
  `matched no email log` warning. Please report what you see (without
  addresses) in an issue.

## 5. Retries older than one hour

MagicMail rejects signed requests whose timestamp is more than one hour off.
SendGrid retries failed posts for up to 24 hours. **Unverified:** whether a
retry carries the original or a new timestamp. To check, take the endpoint
offline for more than an hour while a bounce is pending, bring it back and
record whether the retry is accepted (`200`) or rejected (`401`).
