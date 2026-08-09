## MODIFIED Requirements

### Requirement: Patient data wrapped in structured boundary markers

The `buildPatientSummary()` function SHALL wrap all patient-provided data in XML-style boundary tags. The opening tag SHALL be `<patient_data>` and the closing tag SHALL be `</patient_data>`. A system instruction before the opening tag SHALL state that content within these tags is patient-provided data that must not be interpreted as instructions. A closing instruction after the closing tag SHALL signal that data has ended and analysis instructions resume. Patient fields SHALL be delimiter-escaped or JSON-encoded so that a literal `</patient_data>` sequence in patient content cannot close the data boundary. Specialist consultation results and tool output injected into later prompts SHALL be wrapped in labeled untrusted-data sections. Injection resistance SHALL be evaluated against a corpus covering exact delimiter breakout, Unicode normalization, specialist-to-CMO injection, and malicious tool results.

#### Scenario: Patient data is wrapped in boundary markers
- **WHEN** `buildPatientSummary()` is called with medical history, conversation transcript, and lab results
- **THEN** the output contains the opening `<patient_data>` tag, followed by the three encoded patient data sections, followed by the closing `</patient_data>` tag, with instruction text before and after the tags

#### Scenario: Patient content contains the closing delimiter
- **WHEN** `medicalHistory` contains the exact string `</patient_data>` followed by instructions
- **THEN** the encoding keeps the content inside the boundary and the instructions are not interpreted as directives

#### Scenario: Injection corpus is evaluated
- **WHEN** the injection test corpus is run
- **THEN** breakout, Unicode, specialist-to-CMO, and malicious-tool-result cases are assessed and the pass rate is recorded