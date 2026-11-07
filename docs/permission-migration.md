# Magic-Mail admin permission migration

Magic-Mail now registers four plugin actions in the Strapi admin role editor:

| Action                         | Grant allows                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin::magic-mail.access`    | Show the MagicMail menu entry and the plugin page shell. It grants no API access.                                                                               |
| `plugin::magic-mail.read`      | Read accounts, routing rules, templates, analytics and settings. Also allows template rendering and export, and shows the MagicMail entry in the Settings menu. |
| `plugin::magic-mail.manage`    | Create, update or delete accounts, routing rules, templates, analytics logs and settings. Also allows OAuth setup and account creation.                         |
| `plugin::magic-mail.test-send` | Send test messages from an account, the Strapi email service or a template (10 per minute per admin).                                                           |

Every protected admin API route requires an authenticated admin and its action
above. The `access` action only controls navigation and page entry. It does not
grant API access by itself. Each API operation checks its own capability.

## Update existing roles

Existing roles that previously had only `plugin::magic-mail.access` will keep
seeing the plugin, but their API requests will be denied until they receive the
matching capability grants.

- A read-only role needs `access` and `read`.
- A role that changes plugin data needs `access`, `read` and `manage`. The
  plugin UI loads data before users can manage it.
- A role that sends test messages needs `access`, `read` and `test-send`.
- A full MagicMail administrator needs all four actions.

Grant only the capabilities needed by each role. In Strapi, open Settings,
then Administration Panel, Roles, select a role, and find MagicMail under
Plugins. The actions are listed in the General subsection.

## Users & Permissions email templates

Reading or editing the users-permissions _Reset password_ and _Email address
confirmation_ templates through MagicMail (`/magic-mail/designer/core/:type`)
also requires _Users & Permissions → Email templates_ read or update. Grant
those to every role that edits these templates.

## Visual designer images

Images added in the visual designer are uploaded to the Media Library, so
template editors also need _Media Library → Create (upload)_.

## Public and Content API routes

The Google, Microsoft and Yahoo OAuth callbacks remain public because the
provider redirects cannot carry an admin session. Their signed, expiring,
single-use state is bound to the admin who started the flow.

Since 4.0 the Content API send routes (`/api/magic-mail/send`,
`/api/magic-mail/send-message`) accept API tokens only. Create a custom API
token limited to these two actions; never enable them for the Public or
Authenticated role. Set `contentApi.allowUserRoles: true` in the plugin config
to also allow users-permissions roles (the pre-4.0 behaviour). Open and click
tracking remain public and rate-limited.
