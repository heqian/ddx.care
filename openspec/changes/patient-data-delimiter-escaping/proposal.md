## Why

Patient text is inserted unescaped inside XML-like `<patient_data>` tags. Input containing the literal string `</patient_data>` defeats the claimed structural boundary, letting patient content break out of the data region and inject instructions. Specialist free text — potentially influenced by that input — is then pasted into later CMO prompts as consultation history. External tool prose is returned directly into the agent loop. `jsonPromptInjection: true` is a structured-JSON coercion option, not a prompt-injection defense. No input processor or indirect-injection handling is configured.

## What Changes

- **Escape patient delimiters**: patient fields SHALL be encoded (e.g., JSON-stringified or delimiter-escaped) so literal closing tags inside patient content cannot break the `<patient_data>` boundary.
- **Label untrusted model-derived content**: specialist consultation results and external tool output injected into later CMO prompts SHALL be wrapped in labeled, untrusted-data sections that distinguish them from application directives.
- **Bounded tool output**: external tool prose SHALL be transformed into bounded, allowlisted fields rather than forwarded unrestricted into the agent loop.
- **Injection evaluation**: add an evaluated prompt-injection test corpus covering exact delimiter breakout, Unicode normalization, specialist-to-CMO injection, and malicious tool results, assessed against a real model or adversarial judge.

## Capabilities

### New Capabilities

- `untrusted-content-encoding`: Encodes patient, specialist-derived, and tool-derived content so literal delimiters cannot break structural boundaries and untrusted sections are clearly labeled in model context.

### Modified Capabilities

- `prompt-injection-hardening`: Patient data SHALL be delimiter-escaped or JSON-encoded; specialist and tool output injected into later prompts SHALL be labeled as untrusted data; injection resistance SHALL be evaluated against a corpus.

## Impact

- **Backend**: `src/backend/workflows/diagnostic-workflow.ts` (`buildPatientSummary` escaping, consultation-result labeling, tool-output bounding), `src/backend/tools/utils/fetch.ts` and tool executors (bounded output), `src/backend/workflows/tool-result-summary.ts`.
- **Tests**: `tests/prompt-injection.test.ts` (delimiter breakout, Unicode, specialist-to-CMO, malicious tool results), evaluated corpus.
- **Documentation**: `AGENTS.md` (injection defenses and evaluation).