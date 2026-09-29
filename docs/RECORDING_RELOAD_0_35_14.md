# Recording reload investigation - 0.35.14

User-provided September 29 logs show sessions 239 and 240 persisted. Session 239 finalized approximately 11 seconds after starting. Session 240 was repeatedly detected unfinished on startup, without a subsequent restored-points/completed-recovery message. SQLite error 5 (database is locked) occurred during GPS persistence and outbox draining. These logs establish persistence contention and incomplete recovery, not the cause of every reload or the completeness of the reported 3 km route.

The foreground fallback writes its outbox file before draining it. Therefore the message "Failed to journal the foreground GPS point" can reflect a drain failure after successful file creation; it does not prove that the point was lost. Session 240's active marker was present, so the earlier missing-marker hypothesis does not explain these logs.

The fixes serialize shared-handle mutations, use configured dedicated BEGIN IMMEDIATE transactions, and release canceled recovery claims before replacement effects run. Late canceled callbacks cannot clear newer claims. No history rewrite, database reset or forced device reload is performed.

The user reported seeing the walk again during the investigation. This is encouraging but neither proves all 3 km survived nor confirms the reload trigger. Save with Stop and verify History before any deliberate restart. Existing filesystem outbox entries may still contain recoverable observations.

Version 0.35.13/build 243 becomes 0.35.14/build 244. See [manual validation](TESTING.md#recording-reload-recovery---03514).

Validation: full npm test, TypeScript with unused-symbol checks, git diff --check and offline iOS/Hermes export passed. Physical recovery was reported visible by the user; final saved distance/history verification is still pending.
