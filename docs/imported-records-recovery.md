# Imported record isolation and legacy recovery

## Deployment gate

Do not run a migration, Convex deployment, or production data mutation solely from
this document. No production migration has been executed by this repair.

The schema permits optional `userId` on `events`, `spots`, and `syncMeta` so old
documents do not block schema validation. New mutations assign the authenticated
Convex user ID. Reads and reconciliation use owner indexes and exclude ownerless
documents. Legacy documents remain stored but are not visible to any account.

Public default feeds are imported into each user's own namespace. Ownerless rows
are not treated as a shared baseline: a public-looking event URL does not prove
that its calendar or associated commentary was public.

Before deployment:

1. Take an operator-controlled, access-restricted Convex export. Verify that it
   contains complete `events`, `spots`, `syncMeta`, `sources`, and relevant account
   IDs. Treat this export as private data; do not commit it.
2. Inventory ownerless rows and existing owner-scoped source records. Confirm the
   authenticated account mapping using actual Convex `users` IDs, not display
   names, browser sessions, guessed email addresses, or an assumption that Ian
   owns everything.
3. Rehearse deployment and owner-scoped imports in a separate environment using
   synthetic accounts. Two accounts importing the same URL must receive distinct
   records. Failed fetches must preserve previous records.
4. Review the recovery mapping below. If private data cannot be attributed,
   leave it quarantined and disclose the temporary loss of visibility rather
   than exposing it.

## Safely restore historical personal data

Current feed contents can be restored by each account signing in, confirming its
own sources, and syncing. This creates new owned records without touching legacy
rows. It may not restore removed historical events or private curator notes.

For historical recovery, prepare an explicit operator-reviewed mapping containing
the legacy document ID, destination Convex user ID, verified source ownership,
and evidence for that assignment:

- A source URL associated with exactly one account is supporting evidence, not
  conclusive evidence: public/shared URLs can appear in multiple accounts.
- Require corroboration from source creation records, application audit/export
  history, a source owner's confirmation, or another trustworthy provenance
  record. Do not derive ownership from the current operator account.
- Rows with no source provenance, conflicting evidence, or ambiguous owners
  remain quarantined. Existing `syncMeta` contains globally mixed feed URLs and
  must not be assigned wholesale to any account.
- Use an operator-only internal migration or controlled script after approval.
  Never expose a public mutation that accepts an arbitrary owner ID.
- Copy verified legacy rows to new owner-scoped records first, preserving the
  original quarantined documents and a recovery ledger for rollback. Check for
  an existing owner/item identity before inserting to avoid duplicates. For
  genuinely shared data, separately approve per-owner copies and verify that no
  private notes or private feed URLs are copied to other accounts.
- Verify counts and representative content while authenticated as each rightful
  owner, and verify that a second account cannot read the recovered records.
- Regenerate per-user sync metadata through a new authenticated sync instead of
  copying the old global metadata.

## Ingestion contract

`events:upsertEvents` and `spots:upsertSpots` accept optional
`successfulSourceUrls: string[]`. Only sources whose complete fetch/extraction
successfully finished belong in this set. Missing records accrue missed counts
and become soft-deleted only when their own `sourceUrl` belongs to that set.
Failed, partially fetched, unsupported, and unfetched sources are excluded.
Undefined or empty sets perform no retirement. Records without source provenance
are preserved until attributable recovery or deliberate removal is approved.

Retain `sourceUrl` in persisted spot records. Owners are derived inside Convex,
never supplied in the client mutation payload. Do not reconcile every source when
syncing one source. Soft-deleted records remain stored and can be resurrected by a
subsequent import of the same owned item.

The API sync coalescing key is the server-validated `profile.userId`, never a
global personal key or caller-provided ID.
