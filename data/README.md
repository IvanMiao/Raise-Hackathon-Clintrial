# ClinTrial Synthetic Demo Data

This folder contains synthetic evidence for the ClinTrial hackathon demo.

- `Prot_000.pdf`: source protocol evidence.
- `CTA_Financial_Appendix_Excerpt.pdf`: source CTA / budget evidence.
- `coverage_analysis_billing_grid.csv`: normalized coverage, budget, and protocol mapping rules.
- `mock_site_invoice_scan.svg`: uploaded invoice image fixture.
- `invoice_extraction_fixture.csv`: mocked OCR / extraction output from the invoice image.
- `site_evidence_log.csv`: compact EDC / source-binder / site-operations evidence log.
- `prior_payment_ledger.csv`: compact paid-line history for duplicate checks.

The invoice is intentionally represented as an uploaded image plus an extraction fixture, rather than as the source of truth. ClinTrial should use the fixture as the mocked output of OCR/document extraction, then evaluate each line against the coverage grid, site evidence log, and prior ledger.

The data keeps a small amount of realistic messiness:

- abbreviated invoice descriptions;
- one low-confidence policy mapping;
- a PK subgroup condition failure;
- an unscheduled procedure without authorization;
- a paid duplicate admin fee;
- a voided prior ledger row that should not block payment.

All data is synthetic and read-only. It must not be treated as real clinical, financial, or patient data.
