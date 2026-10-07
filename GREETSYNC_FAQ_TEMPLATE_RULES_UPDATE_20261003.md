# GreetSync FAQ + WhatsApp Template Rules Update — 2026-10-03

This build extends the latest GreetSync QA/build-fixed project.

## FAQ
- All FAQ questions supplied for GreetSync remain grouped in category tabs.
- Every question expands to an answer; search works across the question bank.

## Message template editor
- Variable type help explains Number (`{{1}}`) and Name (`{{order_id}}`) placeholders.
- Numbered placeholders are numbered independently per Meta component (HEADER and BODY each start at `{{1}}`).
- Header: maximum 60 characters, maximum one text variable, no emoji in text headers.
- Body: required, maximum 1024 characters, checks malformed/non-sequential/adjacent variables, variables at the beginning/end, and excessive variables for short text.
- Variable Samples section records the sample value and semantic meaning for every header/body variable.
- Image/video/document samples use Android file picking and Meta resumable upload; location uses latitude/longitude/name fields.
- Action button rules cover Quick Reply, Visit Website, Call Phone Number, Call on WhatsApp, Copy Offer Code and Flow, including per-type limits and input validation.

## Template lifecycle
- Template creation submits to the connected business WABA.
- Draft/Pending/Rejected templates remain visible in GreetSync; approved templates are locked from editing.
- Delete Template is available; Meta-backed templates are deleted through the connected business WABA when allowed.
- Sync from Meta preserves GreetSync variable-meaning metadata for templates originally created in GreetSync.

## Automation variable requirements
- Selecting an approved variable template displays each required HEADER/BODY placeholder, its information type and Meta sample.
- Contact-name variables are filled per recipient automatically.
- Other variables must be supplied before continuing.
- Personalized preview shows the final value for selected contacts.
- Scheduled sends pass header and body template parameters to Meta separately.
