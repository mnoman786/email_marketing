# Google and Microsoft mailbox connections

Accounts supports Google Gmail/Workspace and Microsoft 365 mailbox authorization.
This connects sending and reply detection; it does not change MailFlow login.
Existing password-based SMTP accounts continue to work.

## Configure the backend

Set these values in `backend/.env` (do not put secrets in frontend variables):

```dotenv
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_TENANT=common
MAILBOX_OAUTH_REDIRECT_URI=http://localhost:3000/accounts/oauth/callback
```

The redirect URI must match the registered URI exactly. In production use your
frontend HTTPS origin, e.g. `https://app.example.com/accounts/oauth/callback`.
It must serve this frontend; it is not a backend API callback. Each provider
button is enabled when its client ID and secret are configured. Set a stable
`ENCRYPTION_KEY` before connecting mailboxes; changing it invalidates saved tokens.

Run `python manage.py migrate`, then restart Django and Celery workers. No new
Python dependencies are needed. Both servers and workers need the same OAuth
configuration and encryption key.

## Google

1. Create a Google Cloud project and configure the OAuth consent screen.
2. Create an OAuth client of type **Web application** and register the redirect URI.
3. Request `openid`, `email`, `profile`, and `https://mail.google.com/`.
4. Put the client ID and secret into the backend variables above. While the app
   is in Testing, add the connecting addresses to the consent screen's test users.

SMTP/IMAP require the full `https://mail.google.com/` scope. External production
apps using this restricted scope may require Google verification and a security
assessment. Google's Testing status also limits refresh-token lifetime for these
scopes; use it for development, not unattended production sending.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Gmail XOAUTH2 and scope requirements](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol).

## Microsoft

1. Register an application in Microsoft Entra. Choose the supported account
   types for your deployment. `common` supports the account types enabled on
   the app; use your tenant ID to restrict the app to one organization.
2. Add the callback under **Authentication → Web** (not Single-page application).
   The backend redeems the authorization code with the client secret.
3. Add **Office 365 Exchange Online delegated permissions** `IMAP.AccessAsUser.All`
   and `SMTP.Send`. The flow also requests `openid email profile offline_access`.
   Microsoft Graph `Mail.Send` is not a replacement for SMTP.Send.
4. Create a client secret and put its **value**, the application/client ID, and
   the selected tenant into the backend configuration. Grant administrator
   consent if required by your organization's policy.
5. Enable IMAP and authenticated SMTP for the mailbox where permitted by tenant
   policy. OAuth consent alone does not override disabled SMTP AUTH or IMAP.

This integration uses `smtp.office365.com:587` and `outlook.office365.com:993`.
It targets Microsoft 365/Exchange Online. Consumer Microsoft accounts depend on
their mailbox's protocol availability and should be tested before use.

References: [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
[Exchange OAuth permissions](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth),
[SMTP AUTH configuration](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission).

## Use and verify

1. Sign into MailFlow, open **Accounts**, and click **Connect Google** or
   **Connect Microsoft**. Complete consent in the same browser tab.
2. The mailbox appears with an OAuth label, reply detection enabled, and an
   initial 50-email daily sending limit. Existing accounts retain their settings
   when reauthorized.
3. Send a test email with the test button. Use Edit → Reply Detection → Test IMAP
   Connection to verify receiving. Then add the account to a campaign.
4. Access tokens refresh automatically for campaigns, manual replies, test sends,
   IMAP polling, and warm-up. Revoked refresh tokens set **Reconnect required**.
   Use the reconnect icon and select the same mailbox; reconnecting preserves
   campaign references and inbox history.

Provider hosts and mailbox identity cannot be edited on OAuth accounts. Display
name, signature, limits, active status and reply detection remain editable. An
existing password-based account with the same address is not silently converted.
Deleting an account deletes its stored credentials; it does not revoke the
provider-wide consent grant. Revoke that separately in Google/Microsoft account
settings if desired.

Authorization requests expire after 10 minutes and can be redeemed once. The
flow uses PKCE, a browser-tab state check, authenticated user ownership, and
signature/audience/issuer/nonce validation of provider ID tokens. Access and
refresh tokens are encrypted at rest and never included in API responses.

For a deployment acceptance test, connect one real mailbox per provider, test
sending and receiving, let a token expire and send again, then revoke access and
confirm the reconnect flow. Automated tests mock provider traffic; they do not
replace this live check with your registered applications and tenant policies.
