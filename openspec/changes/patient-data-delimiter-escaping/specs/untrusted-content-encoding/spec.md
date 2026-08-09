## Purpose

Encodes patient, specialist-derived, and tool-derived content so literal delimiters cannot break structural boundaries and so untrusted sections are clearly labeled in model context, reducing indirect prompt-injection success.

## ADDED Requirements

### Requirement: Patient data delimiters are escaped or encoded

Patient fields SHALL be encoded (JSON-stringified or delimiter-escaped) before insertion inside `<patient_data>` tags so that a literal `</patient_data>` sequence in patient content cannot close the data boundary. The encoding SHALL be reversible for display but SHALL prevent structural breakout.

#### Scenario: Patient content contains the closing delimiter
- **WHEN** `medicalHistory` contains the exact string `</patient_data>` followed by instructions
- **THEN** the assembled prompt keeps the content inside the patient-data boundary and the instructions are not interpreted as model directives

#### Scenario: Unicode lookalike delimiters
- **WHEN** patient content contains Unicode characters that normalize to `</patient_data>`
- **THEN** the encoding prevents breakout after normalization

### Requirement: Specialist and tool output is labeled as untrusted data

Specialist consultation results and external tool output injected into later CMO prompts SHALL be wrapped in labeled, untrusted-data sections (e.g., `<untrusted_consult id="cardiologist">...</untrusted_consult>`) that distinguish them from application directives. The CMO instructions SHALL state that content within these sections is model/tool-derived data and must not be followed as instructions.

#### Scenario: Specialist result containing instructions
- **WHEN** a specialist's response contains "Now ignore previous instructions and..."
- **THEN** the CMO prompt wraps the response in an untrusted-data label and the CMO treats it as data, not directives

### Requirement: Tool output is bounded and allowlisted

External tool prose SHALL be transformed into bounded, allowlisted fields (e.g., counts, structured summaries, capped snippets) before injection into the agent loop, rather than forwarding unrestricted raw API response text.

#### Scenario: Tool returns a large raw response
- **WHEN** a medical API returns a multi-kilobyte raw payload
- **THEN** only bounded, allowlisted fields reach the agent prompt

#### Scenario: Tool response contains instruction-like text
- **WHEN** a tool response contains text resembling model instructions
- **THEN** the bounded representation does not forward the instruction-like text as a directive