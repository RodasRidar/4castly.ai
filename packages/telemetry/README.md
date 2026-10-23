# packages/telemetry

Shared by `apps/api` and `apps/worker` so the same rules apply everywhere: structured logs in the plan's
standard fields, redaction of emails, tokens and client content (S9), and an OTLP span exporter that strips
prompts and completions before anything reaches Axiom.
