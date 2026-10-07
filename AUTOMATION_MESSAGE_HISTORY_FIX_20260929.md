# Automation Message History Fix — 29 Sep 2026

## Fixed
- Automation cards now show recipient, phone, template name, rendered message preview, scheduled date/time, executed date/time and status.
- Automation list no longer hides SIMULATED, PAUSED or CANCELLED rows from the All view.
- Automation details now calls `/api/automations/:id` instead of relying only on the list summary.
- Details show the rendered template/custom message, template variables, scheduled time, executed time, timezone and errors.
- Details show WhatsApp message activity including sent, delivered, read and failed timestamps plus WhatsApp message ID.
- `/api/automations` and `/api/automations/:id` now return template components so Flutter can reconstruct the message preview.
- Worker now stores rendered message content in outbound message records for future sent/simulated/failed records.
- Existing `hello_world` default-template and device-contact build fixes are retained.

## No database migration required
The existing `messages.content` column is reused. Existing message rows without content still display automation/template data; future worker-created records include rendered content.
