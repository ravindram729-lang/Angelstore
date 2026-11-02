# Angelstore STEP652 — Receipt Print Layout Fix

Date: 2026-10-24

## Changes
- Added separate `Print 58 mm Thermal` and `Print A4` actions to the customer receipt window.
- Added thermal-specific narrow layout, compact typography, wrapping, and receipt-friendly separators.
- Added A4 portrait print sizing and page margins.
- Receipt window now allows the user to choose a print size instead of immediately triggering a print dialog.
- Existing PDF download endpoint and receipt authorization behavior were not changed.

## Verification
- `node --check customer.js`: PASS
- `node STEP521_RECEIPT_PDF_PRINT_TEST.js`: 10/10 PASS
- ZIP integrity: verified after packaging

## Limitations
- Browser/physical printer output has not been tested on the user's actual 58 mm thermal printer or A4 printer. For thermal printing, the printer driver must be set to 58 mm paper width. A4 is configured as portrait.
- No live deployment or changes to the user's running server were made.
