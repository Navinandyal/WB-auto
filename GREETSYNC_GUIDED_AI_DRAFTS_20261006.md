# Guided AI templates, editor drafts and delivery reasons

This package updates the GreetSync Android source to **1.0.2+3**. It includes all files and contact-import samples from the preceding recovery package. The ZIP contains source, not a built APK.

## Why a message still says Awaiting delivery

That label means the app has no confirmed delivery receipt for the attempt. It is not a Meta error code. An HTTP send acknowledgement or WhatsApp message ID does not establish that the recipient received the message. Missing callbacks and a genuinely undelivered message can produce the same label.

The public production health endpoint was reachable during this work and reported `delivery-recovery-ai-rest-20261006`, the preceding recovery build. This rules out that server being an older build, but it does not identify an individual message's error. No authenticated production message records, received callback payloads or Meta credentials were available here. There is no evidence to name a particular Meta rejection code for your pending messages.

After deploying this backend, open the message's Automation details. The new reason card reports the stored send result and any received callback matching that business's verified WABA, phone number and message/activity. It shows the actual error code and details when available, and the WhatsApp message ID and callback reference for investigation.

| Reason | Meaning and next action |
| --- | --- |
| No delivery receipt | A message ID exists, but there is no recorded delivered/read/failed receipt. Run **Test connection** in WhatsApp connection settings and verify the Meta app's messages webhook field and callback URL. This is an evidence gap, not a fabricated failure code. |
| Delivery callback setup needs attention | The stored send attempt contains a setup warning. Correct the specific warning and test the connection. |
| Meta returned a delivery failure | A real callback reports failure. The card shows Meta's code/details; fix that reported cause before another attempt. |
| A receipt is being processed | A matching callback arrived and is awaiting the saved webhook processor. Refresh after processing; the existing processor retries deferred callbacks. |
| Receipt and activity need reconciliation | A processed callback and activity disagree. Use the callback reference to investigate before attempting another send. |
| Meta holding/paused | The original send response explicitly reported a hold/pause. Check the template/account in WhatsApp Manager. |
| Send connection ended without confirmation | The request outcome remains unknown. A signed callback can recover it; avoid another send until checking the recipient. |
| WhatsApp sent the message | A sent status exists, but delivery to the recipient device has not been confirmed. |

The reason card does not rewrite messages as Delivered, automatically resend them, or fabricate an explanation for a missing receipt. The preceding package's callback override, signed receipt recovery, idempotency, video/PDF upload checks and actual Meta failure persistence remain included.

## Guided AI creation

1. Open **Templates → AI Template Generator**. Select Birthday, Campaign, Marketing offer, Festival greeting, Customer reminder or Other.
2. Choose English, Hindi, Marathi, English + Marathi, or English + Hindi. Bilingual templates retain the corresponding supported Marathi/Hindi Meta language code. Choose Professional, Friendly or Inspirational and the recipient type.
3. Fill the optional preview name. Birthday has school/organization, age and achievement inputs. Other purposes have campaign/message goal, supplied offer/benefit, date/deadline and the customer action.
4. Select Text only, Image, Video, PDF document, Location or AI suggests. Expand **Example prompt** to see purpose-specific guidance using your saved business identity. Add optional extra instructions, then Generate Template.
5. Review the WhatsApp preview. Add a **Small change note** and choose **Generate updated template**, or choose **Edit template** to change the content manually. **Back to AI** preserves those edits as the next generation's current draft.
6. **Use template** opens the existing review popup with **Save as draft** and **Submit for approval**. Approval validation still requires actual selected/uploaded media or a real map location, valid template fields and variable samples. AI never invents media files, coordinates or approval.

Birthday follows the supplied Brain Educational Consultancy example: 60–120 words, caring/professional/inspiring language, motivation appropriate to the recipient's role, no repetitive quote, and the exact closing `Warm Regards,` / `Team <saved business name>`. For the Brain business account, that is `Team Brain Educational Consultancy`. The closing uses the backend's saved owner identity, not a client-supplied alternative business name. Birthday, Campaign, Marketing and Festival are categorized as Marketing; Utility remains for a specific customer transaction/request without promotion.

The name is a preview sample for `{{customer_name}}`; each send resolves the selected contact's name. If the generated text includes the optional age, it uses `{{customer_age}}`, whose actual value comes from that contact's date of birth. Enter the DOB before sending an age-based template. Organization and special-achievement facts can appear literally: review them for the intended audience before a bulk send.

**Check AI connection** has been removed from this screen. Generation still shows actionable configuration/provider errors and preserves current content if generation fails. The existing Gemini backend configuration and error handling remain; no AI key is embedded in the mobile source.

## Save or discard unfinished work

Leaving a changed template, message composer or contact editor prompts **Save as draft**, **Discard**, or **Keep editing**. This covers the editor Back action, system Back, fixed bottom navigation, the central Send message action and shell header navigation. In-flight sending, approval, upload or generation must finish before leaving.

These exit drafts are encrypted device storage, scoped to backend URL and business account. Saving a draft makes no send, schedule or contact API request. Reopening the editor offers Continue draft or Discard saved draft. Templates and Contacts also expose a Continue card for a new local draft. The message composer offers its draft when reopened. Editing existing templates/contacts and reviewed send-again drafts use separate keys.

Partial forms are allowed. Template drafts retain AI options/history/change note, manual content, variables, buttons, actual selected media and partial location. Message drafts retain audience/groups, current step, template, values, timing, media/location and the original send request ID. Contact drafts retain partial number/name, photo, date of birth, consent and groups. A restored past schedule must be reviewed; restoring never sends it automatically.

The exit draft differs from the server-side **Save as draft** in the approval popup. The exit draft remains on this device until explicitly saved/submitted through the existing server action. Successful contact/message/template completion removes only the corresponding local draft. Draft removal after a successful server action is best effort, so a device-storage error cannot repeat a completed server operation. A save/discard storage failure keeps the editor open. Local drafts are limited to 25 MiB including attachment encoding; an oversized attachment requires removal or Discard before exit.

## Rollout and checks

Deploy the backend with the existing setup procedure, then rebuild/install the mobile source. `GET /api/health` should report **`guided-ai-drafts-delivery-reasons-20261006`**. The new app cannot obtain the detailed reason from a backend running only the previous build. The public production endpoint was checked read-only; this new package has not been deployed here.

Automated verification passed: **87 backend tests**, **18 isolated PostgreSQL integration scenarios**, **19 executable Dart draft/prompt checks**, TypeScript checking, and the Vite/esbuild production build. Offline analysis of the nine changed mobile source files plus the Dart check found **0 errors and 0 warnings** (159 lint/deprecation information items). External Meta/AI requests in tests are mocked; database checks use the production schema and callback handler in PGlite.

No native Flutter build, widget rendering, Android secure-storage/plugin execution, real Gemini generation, real WhatsApp delivery or production deployment was performed. On a phone, verify: each editor's Back and bottom-tab exits; Keep editing; Save and resume including an attachment; Discard without another editor losing its draft; partial contact phone restoration; Birthday/Bilingual generation and manual revision; actual media/location before approval; and pending/failed/delivered details after real signed callbacks. Older release notes describe their respective earlier screens; this guide describes the current AI screen and local drafts.
