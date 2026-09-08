# Notification delivery guarantees

Each queued email has a deterministic UUID derived from the request, email address,
event, language, scope, season/episode and explicit resend identity. Transient
rendering data does not change it. The `notification_deliveries` primary key enforces
uniqueness. A database compare-and-set reserves the email before contacting a provider.

The durable states are `prepared`, `sending`, `sent` (accepted by the provider),
`uncertain`, `failed` (explicit rejection), `cancelled` and `obsolete`. Removing queue
rows or notification logs does not remove this ledger. A process that dies after
reservation leaves a `sending` record requiring verification; it is never reclaimed
automatically. An ambiguous timeout never triggers automatic provider fallback.

Brevo receives `headers.idempotencyKey`; SMTP receives a stable Message-ID and
X-Watchdeck-Send-Key. SMTP Message-ID is a correlation identifier, not a provider
deduplication guarantee. Brevo's own deduplication is time-limited; Watchdeck's local
ledger is not. See [Brevo's documentation](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

New co-requester membership and both catch-up events are committed together. Scheduling
happens after commit; persisted events survive failure and are reloaded on worker
startup. Existing co-requesters are not automatically backfilled from missing old
receipts. Before sending, membership, preferences, current availability, cancellation
and previous delivery are checked again. Processing an existing queued email manually
does not bypass its unique key; an explicit resend creates a new identity.

The resume preview counts recipients, while the queue count counts rows. Reactivating
automatic delivery keeps the existing backlog marked for explicit review, including
after a worker restart. The Notifications screen exposes the last 100 ledger records.
For `uncertain` / stale `sending`, check the provider's journal using the key before
deciding whether an explicit resend is needed; no automatic receipt lookup is implemented.

Migration `0013_notification_deliveries` creates the new ledger. It does not infer
delivery of historic emails and does not purge the existing production queue.
