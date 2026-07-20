# Phase D10-K — Second Controlled Migration Candidate Assessment

## 1. Scope and decision boundary

This phase is an assessment only. It performs no Topic migration, does not create a migration record or backup artifact, and does not write Topic data.

No HTML authorization was expanded. No cohort was enabled. THTML-04 and THTML-05 remain excluded. Runtime, SaveStrategy, ContentEditor, and the Topic schema were not changed.

The D10-J3 closure for Topic `99` is treated as the prerequisite evidence: its first real THTML-01 migration completed, its observation window is `observation_closed`, and no rollback trigger was recorded.

## 2. Assessment method

The current `topics` table was read without mutation (`57` Topics). Each outline was classified conservatively:

- **THTML-07**: empty or whitespace-only outline;
- **THTML-01**: one or more attribute-free `<p>...</p>` blocks containing only plain text;
- otherwise excluded from this assessment.

The scan rejected any outline containing annotation/comment attributes, `font`, `span`, inline `style`, `color`, `background-color`, `font-family`, `font-size`, or tags other than `<p>`.

Existing test Topics (`115`–`119`), Topic `99`, and all Topics in `shooting`, `production`, `completed`, or `rejected` status were excluded. The remaining candidates are `approved` and must be rechecked for active collaboration, assignment, and workflow activity immediately before any later migration phase.

The offline compatibility admission verified the approved types without writing data:

| Type | Parse → serialize → reload result | Authorization |
| --- | --- | --- |
| THTML-01 | Stable for the ordinary-text fixture | Approve, one Topic only |
| THTML-07 | Stable as canonical `<p></p>` | Approve, one Topic only |
| THTML-04 / THTML-05 | Technically stable fixtures, but excluded by governance | Pilot Only — not considered |

## 3. Recommended first candidate

| Field | Assessment |
| --- | --- |
| Candidate Topic | `77` — `为什么说宋真宗拉低了封禅的含金量` |
| Current status | `approved` |
| HTML type | `THTML-01` |
| Outline form | Attribute-free ordinary `<p>` blocks only |
| Original outline SHA-256 | `fa360e0f11f515ef3a597dfb8315e82f2b4b8dab27ace616345cbad7b70d4017` |
| UTF-8 bytes | `981` |
| Annotation / font / style / color / unknown HTML | Not detected |
| Candidate runtime HTML | The existing outline itself; no canonical content rewrite is expected |
| Candidate hash | Same as original: `fa360e0f11f515ef3a597dfb8315e82f2b4b8dab27ace616345cbad7b70d4017` |
| Migration-risk level | Low, subject to pre-execution workflow and permission recheck |

### Why Topic 77 is first

It is a real, non-empty THTML-01 Topic with the same low-risk shape proven by Topic 99: plain paragraphs, no unsupported HTML semantics, and an expected byte-preserving runtime/manual-save round-trip. Choosing it first keeps the second controlled migration within the already observed HTML class rather than introducing the THTML-07 empty-to-`<p></p>` canonicalization in the same step.

## 4. Backup, record, and rollback feasibility

Topic 77 satisfies the technical prerequisites for a future migration record, but **no record or backup was created in D10-K**.

If a later, explicitly authorized migration phase begins, create the record before any page write and include:

1. Topic `77`, title, current renderer mode, status, assigned operator, and acceptance owner;
2. the exact original outline and the SHA-256/hash and byte-size values above;
3. THTML-01 admission results and candidate runtime HTML/hash;
4. normal-page rollback instructions: restore the exact original outline through `ContentEditor -> manualSave -> aggregate save -> updateTopic`, then refresh and re-check the original hash and byte size;
5. observation-window start/end fields and stop/rollback triggers.

Because the candidate runtime HTML is expected to equal the original outline byte-for-byte, the rollback payload is known and reproducible from the record’s immutable original backup. This feasibility conclusion is not permission to create the record or execute the migration now.

## 5. Alternative candidates and recommended order

| Order | Topic | Type | Current status | Assessment |
| --- | --- | --- | --- | --- |
| 1 | `77` — `为什么说宋真宗拉低了封禅的含金量` | THTML-01 | approved | Recommended first: non-empty, byte-preserving plain-paragraph candidate |
| 2 | `74` — `粽子咸甜之争到各类创新粽子口味评鉴` | THTML-07 | approved | Eligible only after a separate single-Topic decision; empty outline would canonicalize to `<p></p>` |
| 3 | `76` — `岱庙的这些“神兽”，你都认识几个？` | THTML-07 | approved | Same THTML-07 admission profile; retain as an alternate, not a concurrent target |
| 4 | `98` — `洗心亭：一座石亭，两种洗心` | THTML-07 | approved | Same THTML-07 admission profile; retain as an alternate, not a concurrent target |
| 5 | `97` — `父亲节等了63年，母亲节只等了6年。为什么？` | THTML-07 | approved | Same THTML-07 admission profile; retain as an alternate, not a concurrent target |

Topics in `shooting`, `production`, `completed`, or `rejected` status were deliberately not ranked, even when their outline is empty or ordinary text. Test Topics and Topic `99` are also not candidates.

## 6. Single-Topic admission conclusion

**Topic 77 conditionally satisfies the technical single-Topic migration admission for THTML-01.**

The remaining conditions are operational and must be checked in the later execution phase, immediately before any write:

- it is not actively being collaborated on, reviewed, produced, published, or otherwise business-critical;
- an authorized operator and acceptance owner are named;
- a non-overwritable migration record and original-content backup exist before the first save;
- the standard TopicDetail path, rollback rehearsal, and observation window are explicitly approved for that one Topic.

No candidate is authorized for automatic migration by this assessment. Maintain the one-Topic cadence and stop after D10-K.
