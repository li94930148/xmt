# Phase D10-O — Topic Runtime Migration Governance Completion

## 1. Governance completion statement

Phase D10 establishes the governance boundary for Topic Runtime migration. Its evidence supports only manually approved, one-Topic-at-a-time, reversible migration work. It does not establish batch migration, cohort rollout, automatic candidate execution, or a change to the Topic data model.

No Topic migration, migration record, backup artifact, database write, code change, or Runtime change is made in D10-O.

## 2. Phase D10-H through D10-M summary

| Phase | Outcome |
| --- | --- |
| D10-H1 | Established a controlled legacy-renderer fixture for Topic migration evidence. |
| D10-H2 | Completed the first isolated THTML-01 fixture pilot through the standard TopicDetail save path, including rollback. |
| D10-H3 | Assessed controlled scope expansion and preserved type-by-type governance boundaries. |
| D10-H4 | Completed browser pilots for THTML-07, THTML-04, and THTML-05; fixture success did not create broad production authorization. |
| D10-I | Formalized per-Topic HTML authorization and mandatory admission, backup, rollback, acceptance, and observation controls. |
| D10-J / J1 / J2 / J3 | Performed Topic 99’s first real THTML-01 controlled migration, browser validation, observation review, and formal observation-window closure without rollback trigger. |
| D10-K | Assessed Topic 77 as a technically admissible THTML-01 candidate. |
| D10-L / L1 / L2 / L3 | Blocked and tracked Topic 77 when its operational workflows moved through review, shooting, publishing, and finally completed state; no migration was executed. |
| D10-M | Re-ran candidate discovery and found no Topic satisfying all technical and operational entry gates; result: rejected. |

Phase D10-N was intentionally skipped because D10-M found no candidate requiring a candidate-pool management phase.

## 3. Verified capabilities

The following capabilities have evidence from the fixture pilots and/or Topic 99’s real controlled migration:

| Capability | Governance result |
| --- | --- |
| Runtime renderer | Verified for approved types within the TopicDetail renderer branch. |
| Single editor instance | Verified in browser evidence: one editable `.ProseMirror` instance and no legacy double mount for the validated path. |
| `manualSave` | Verified through the Runtime manual-save bridge. |
| Aggregate save | Verified through the TopicDetail aggregate save gate and existing `updateTopic` payload path. |
| Refresh recovery | Verified after save for the validated migrations/pilots. |
| Leave guard | Verified for clean leave, dirty leave, and discard. |
| Rollback | Verified through standard TopicDetail restoration and refresh/hash confirmation. |
| Observation window | Verified for Topic 99: the record moved from `observation_active` to `observation_closed` with no rollback trigger. |

The approved path remains:

```text
TopicDetail Runtime
  -> ContentEditor manualSave
  -> TopicDetail aggregate save gate
  -> updateTopic
```

Direct database writes and special migration APIs are outside this governance path.

## 4. HTML admission status

| Admission state | HTML types / content | Governance boundary |
| --- | --- | --- |
| **Approve** | THTML-01 ordinary text; THTML-07 empty HTML | Eligible only for a separately approved, single-Topic controlled migration after all operational gates pass. |
| **Pilot Only** | THTML-04 lists; THTML-05 tables | Fixture or separately approved focused pilot only. THTML-04 retains its Tab-interaction limitation; neither type has cohort or automatic real-Topic authorization. |
| **Blocked** | annotation/comment markup; `font`/`span`/style formatting; color/background formatting; unknown or abnormal HTML | No migration write. These need separate compatibility, mapping, or safety work. |

Mixed HTML follows the strictest component: any blocked signal blocks the entire Topic from controlled migration.

## 5. Future standard for one controlled migration

Every future migration must follow this sequence and must stop at any failed gate:

1. **Discovery and admission** — classify the exact stored outline; require THTML-01 or THTML-07; reject blocked or pilot-only material unless separate authorization exists.
2. **Operational clearance** — verify the Topic is not in completed, archived, cancelled, production/review, shooting, publishing, or active-collaboration workflow; name an authorized migration operator and acceptance owner.
3. **Immutable preparation** — before a write, create a per-Topic migration record containing original outline, SHA-256, byte size, candidate HTML/hash, operator, acceptance owner, rollback payload/steps, and observation dates.
4. **Standard execution** — use only `TopicDetail Runtime -> ContentEditor manualSave -> aggregate save gate -> updateTopic`.
5. **Browser acceptance** — verify runtime renderer, one editable ProseMirror, editing, save, refresh recovery, clean leave, dirty leave, and discard.
6. **Rollback rehearsal** — restore the original outline through the normal page path, refresh, and verify the original hash and byte size; then perform a separately approved final migration write if still warranted.
7. **Observation** — mark the completed record `observation_active`, monitor the defined window for save/refresh/renderer/leave errors and feedback, and close only that record when all checks pass.

No successful migration authorizes the next one automatically. Each Topic repeats every gate independently.

## 6. Current governance state

Topic 99 remains the only real Topic migration with a completed observation window. Topic 77 is not migratable because it reached a terminal `completed` workflow state. D10-M found no qualifying replacement candidate.

Accordingly, the migration program is in a governed **no-execution** state until a future Topic passes both technical admission and operational clearance. Maintain the single-Topic cadence and do not expand HTML authorization or open a cohort without a new explicit governance decision.
