# Jtb archive

Every newly started performance is saved automatically, including instrument demos. A **set** is one continuous jam with its queued songs; a **show** contains everything recorded on a calendar day in `ARCHIVE_TIMEZONE` (default America/New_York). Sets crossing midnight appear in both days, with playback clipped to the selected day. Queued songs that were never played are excluded from the daily song list.

## Local test

Use Node 22.13 or newer. Run `npm install`, then `npm run dev`. With DATABASE_URL unset, recordings go to ignored `data/jtb.sqlite`. Enter a mandatory title and optional description. Their combined text follows the existing musical prompt path. Start an **Instrument demo** for a free test, end it after a few phrases, then open **Jtb archive**. Search title, description or date; use Replay show to play the whole day. Songs appear once in a single chronological list, without separate set cards. Pause, resume and seek are private to your browser. Return to live does not stop the shared room.

SQLite's WAL and SHM sidecars belong to the database. Do not copy only the main file while the server writes; use SQLite's backup mechanism or stop the app gracefully before copying. Keep backups. The archive is append/upsert-only; there is no automatic retention deletion.

## Railway PostgreSQL and migration

1. Add a Railway PostgreSQL service and reference its DATABASE_URL from this app. Run exactly one app replica. The app creates the archive table at startup and refuses Railway startup without DATABASE_URL.
2. End local sets before migration. Keep the destination application idle during migration. Back up both databases.
3. Supply `ARCHIVE_TARGET_DATABASE_URL` securely in your shell or ignored `.env` using the destination's reachable PostgreSQL URL (Railway's private hostname is only reachable inside Railway). Keep TLS verification enabled when required by that connection.
4. Run `npm run archive:migrate -- data/jtb.sqlite`.
5. The command rejects conflicting IDs, copies all records in one transaction, verifies SHA-256 content hashes per set and reports counts. Identical reruns are safe. It never deletes the source. Verify the destination archive UI before retiring the local copy.

Configure the database before deploying this release. Local-to-production migration is an explicit operation; deployment does not upload your local recordings. Past unsaved shows cannot be reconstructed retroactively.

## Recording contract

This is a versioned event-style performance capture: committed note frames, timing, pedals, lighting, engineer mix, complete emitted decision traces (raw and applied choices), and theme/director metadata. Replay downloads stored data and renders locally; it never calls Jev or the director. It is not a WAV or a bit-identical audio master: local mixer settings, synthesis randomness, sample/renderer changes and restarting a sustained sound when seeking can alter the rendered sound. Keep the matching app revision and bundled samples for long-term reproducibility.

One writer buffers up to 32 MiB. It flushes within 100 ms, at 32 events, and immediately before frame/state publication. SQLite uses WAL plus synchronous FULL; PostgreSQL uses transactions. Each batch commits before its audience notifications. Stable IDs make uncertain-commit retries safe. Three bounded attempts precede a visible failure that stops the room and blocks further starts. A hard crash may lose uncommitted responses in the short buffer; previously committed playback remains recoverable. Graceful app shutdown drains pending writes; startup marks unfinished sets as interrupted. This does not promise recovery from storage-device loss: database backups are still necessary.

Archive read endpoints are public to the same audience as the stage. Submitted titles/descriptions and decision context appear in the archive; controller/provider secrets are not recorded. There is no archive-delete endpoint.
