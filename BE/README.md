## Admin operations

All `/api/admin` endpoints require a valid bearer token and the `Admin` role.

For an existing database, apply `src/scripts/admin-operations-migration.sql` once
before deploying the admin API. Fresh databases created from the repository's
`sql.sql` already include the account statuses, partner payout ledger, partner
payment-account storage, and system financial-account ledger. The admin
dashboard reads each account's atomically maintained current balance and
auditable signed transactions.

The admin can configure one platform-wide commission rate (default 10%, up to
two decimal places). When a partner's trip is marked completed, paid ticket
revenue is settled once (the backend checks for completed trips every minute).
Changing the rate never recalculates an already settled trip.

Paid bookings credit the system wallet, keeping their funds available for
approved refunds. When a trip is completed, the commission is moved from the
system wallet to the commission wallet, and the remaining ticket revenue is
added to the partner's withdrawable balance. A payout transfers the partner's
entire available balance in one action: it debits the system wallet, credits
the partner's in-app wallet, and records the wallet transaction atomically.
The admin enters a payout reference; no external bank transfer is initiated.
Trip settlement waits while a paid booking has a pending cancellation/refund
request, so its funds are not allocated to the partner before the refund is
resolved.

The migration backfills system-wallet entries for existing paid/refunded
bookings, approved refunds, settled-trip commissions, and recorded partner
payouts. It also credits recorded payouts to partner in-app wallets when that
credit is not already present. It is safe to rerun: each backfill checks for an
existing ledger entry.

## Local backend setup

1. Copy `.env.example` to `.env` in the `BE` directory.
2. Set the local MySQL credentials and create the `booking` database from the
   repository's `sql.sql` (or connect to an existing compatible database).
3. Start MySQL and Redis, then run `npm run dev` from the `BE` directory.
4. Google sign-in, Gmail OTP delivery, and VNPay require their corresponding
   credentials in `.env`. For Gmail OTP delivery, configure `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`, then open
   `http://localhost:3001/api/gmail/auth/google` once and grant the Gmail
   read/send permissions. The OAuth token is stored in the ignored
   `gmail-token.json` file. Registration and password-reset OTPs are sent using
   the Gmail API; `EMAIL_USER` and `EMAIL_PASS` are SMTP credentials for ticket
   emails, not OTP delivery. The API server can start without these optional
   integrations, but the corresponding features will report a configuration
   error when called.