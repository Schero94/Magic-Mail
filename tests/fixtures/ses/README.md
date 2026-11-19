# Amazon SES event and Amazon SNS message examples

`aws-doc-examples.json` holds the JSON examples from the AWS documentation,
copied verbatim on 2026-11-18. No AWS API was called.

`sesEvents`, one record per `eventType`, from "Examples of event data that
Amazon SES publishes to Amazon SNS":
<https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-examples.html>
(field meanings: "Contents of event data that Amazon SES publishes to Amazon
SNS", <https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html>).

`snsMessages`, the HTTP POST body examples from:

| Key                        | Page                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `Notification`             | <https://docs.aws.amazon.com/sns/latest/dg/http-notification-json.html>              |
| `SubscriptionConfirmation` | <https://docs.aws.amazon.com/sns/latest/dg/http-subscription-confirmation-json.html> |
| `UnsubscribeConfirmation`  | <https://docs.aws.amazon.com/sns/latest/dg/http-unsubscribe-confirmation-json.html>  |

The documentation signatures are placeholders (`EXAMPLE...`) and the
certificate URLs no longer resolve, and AWS publishes no signed test message.
The tests therefore re-sign these messages with a key pair and a self-signed
certificate generated at test time (`tests/helpers/test-certificate.js`),
building the string to sign exactly as the SNS page "Verifying the signature
of an Amazon SNS message" defines it.
