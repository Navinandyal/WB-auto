import { sendRetryPlan } from './send-retry.ts';
import { marketingRetryAfter, marketingLimitMessage } from './marketing-limits.ts';
import { prepareDeliveryTracking } from './delivery-setup.ts';
import { acceptanceVariables } from './message-acceptance.ts';
import { semanticComponents, previewSnapshot } from './template-rules.ts';
import { and, eq, lte, gte, asc, isNull, or } from 'drizzle-orm';
import { db as defaultDb, isDatabaseConnected, pool } from '../db/index.ts';
import {
  automations,
  contacts,
  messageTemplates,
  messages,
  automationExecutions,
  whatsappAccounts,
} from '../db/schema.ts';
import { localStore } from '../db/localStore.ts';
import { WhatsAppService } from './whatsapp.ts';
import { resolveWhatsAppCredentials } from './credentials.ts';
import { WishflowService } from './wishflow.ts';
import { createNotification } from './notifications.ts';
import { assertMessageCapacity } from './subscriptions.ts';

function renderTemplateMessageContent(template: typeof messageTemplates.$inferSelect, variables: Record<string, string> | null | undefined): string {
  const vars = variables || {};
  const custom = String((vars as any)._customMessage || '').trim();

  const components = Array.isArray(template.components) ? template.components as any[] : [];
  const body = String(components.find((component: any) => String(component?.type || '').toUpperCase() === 'BODY')?.text || '').trim();
  if (!body) return custom || (template.name === 'hello_world' ? 'Hello World' : '');

  let rendered = body;
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith('_') || key.startsWith('header_')) continue;
    const token = key.startsWith('body_') ? key.slice(5) : key;
    const escapedKey = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), String(value));
  }
  return rendered;
}

export interface WorkerRunResult {
  processed: number;
  successCount: number;
  failureCount: number;
  deferredCount?: number;
  message?: string;
  details?: Array<{
    id: number;
    contactName: string;
    status: string;
    error?: string;
  }>;
}

export class AutomationWorker {
  constructor(private readonly db: typeof defaultDb = defaultDb,
    private readonly pause: (ms:number)=>Promise<void> = ms=>new Promise(resolve=>setTimeout(resolve,ms))) {}
  private isProcessing = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private pollIntervalMs = 5000; // Check every 5 seconds
  private lastWarningLogged = 0;

  start() {
    if (this.intervalTimer) return;
    console.log('[Worker] Starting scheduled WhatsApp automation worker...');

    // Run initial check after short delay
    setTimeout(() => {
      this.tick();
    }, 2000);

    this.intervalTimer = setInterval(() => {
      this.tick();
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    console.log('[Worker] Stopped WhatsApp automation worker');
  }

  async triggerNow(options?: { forceId?: number; forceAll?: boolean; simulate?: boolean }): Promise<WorkerRunResult> {
    return await this.processDueAutomations(options);
  }

  private async tick() {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;
      await this.processDueAutomations();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (
        msg.includes('SASL') ||
        msg.includes('password') ||
        msg.includes('client password') ||
        msg.includes('ECONNREFUSED') ||
        err?.code === '28P01'
      ) {
        const now = Date.now();
        if (now - this.lastWarningLogged > 60000) {
          console.warn('[Worker] PostgreSQL offline. Using local resilient store for automations.');
          this.lastWarningLogged = now;
        }
        return;
      }
      console.error('[Worker] Error in automation worker tick:', msg);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processDueAutomations(options?: { forceId?: number; forceAll?: boolean; simulate?: boolean }): Promise<WorkerRunResult> {
    const now = new Date();
    const forceId = options?.forceId;
    const forceAll = options?.forceAll ?? false;
    const allowSimulation = options?.simulate ?? localStore.simulationMode;

    if (isDatabaseConnected) {
      try {
        return await this.processDatabaseAutomations(now, forceId, forceAll, allowSimulation);
      } catch (err: any) {
        console.warn('[Worker] Database query failed, checking local store:', err?.message);
      }
    }

    return { processed: 0, successCount: 0, failureCount: 0, message: 'Database unavailable; automation processing is paused to avoid mock/local data.' };
  }

  private async processDatabaseAutomations(
    now: Date,
    forceId?: number,
    forceAll?: boolean,
    allowSimulation?: boolean
  ): Promise<WorkerRunResult> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    let whereClause;
    if (forceId) {
      whereClause = and(eq(automations.id, forceId), eq(automations.status, 'SCHEDULED'));
    } else if (forceAll) {
      whereClause = and(
        eq(automations.status, 'SCHEDULED'),
        or(isNull(automations.lockedAt), lte(automations.lockedAt, fiveMinutesAgo))
      );
    } else {
      whereClause = and(
        eq(automations.status, 'SCHEDULED'),
        lte(automations.scheduledAt, now),
        or(isNull(automations.lockedAt), lte(automations.lockedAt, fiveMinutesAgo))
      );
    }

    const dueJobs = await this.db
      .select({
        automation: automations,
        contact: contacts,
        template: messageTemplates,
      })
      .from(automations)
      .innerJoin(contacts, eq(automations.contactId, contacts.id))
      .innerJoin(messageTemplates, eq(automations.templateId, messageTemplates.id))
      .where(whereClause)
      .orderBy(asc(automations.scheduledAt), asc(automations.id))
      .limit(25);

    if (dueJobs.length === 0) {
      return { processed: 0, successCount: 0, failureCount: 0, message: 'No due automations in database queue.' };
    }

    let successCount = 0;
    let failureCount = 0;
    let deferredCount = 0;
    const details: Array<{ id: number; contactName: string; status: string; error?: string }> = [];

    for (const job of dueJobs) {
      const { automation, contact, template } = job;

      // Hard tenant boundary: an automation may only use contacts/templates owned by
      // the same business account. This prevents accidental cross-business sends even
      // if database rows were corrupted or an ID was tampered with.
      if (automation.ownerUserId !== contact.ownerUserId || automation.ownerUserId !== template.ownerUserId) {
        const errorMsg = 'Tenant ownership mismatch. Automation, contact and template must belong to the same business.';
        await this.db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
        await this.db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
        failureCount++;
        details.push({ id: automation.id, contactName: contact.name, status: 'FAILED', error: errorMsg });
        continue;
      }

      // Lock job
      const lockResult = await this.db
        .update(automations)
        .set({
          status: 'PROCESSING',
          // Older and generated birthday jobs get a snapshot before execution.
          templateSnapshot: automation.templateSnapshot ?? previewSnapshot(template),
          lockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(automations.id, automation.id),
            eq(automations.status, 'SCHEDULED')
          )
        )
        .returning();

      if (lockResult.length === 0) {
        continue;
      }

      // Conservative pacing, below Cloud API throughput. A recipient failure must
      // not abandon the remainder of a durable bulk batch.
      await this.pause(250);
      let res: {status:string; errorMessage?:string};
      try {
        res = await this.executeJob(automation, contact, template, undefined, allowSimulation);
      } catch (error: any) {
        const note = 'Processing ended without a confirmed result. Check the recipient and delivery updates before creating another attempt.';
        // Never replay a possibly accepted network send after an unexpected error.
        // Guard the state so an early delivered/failed webhook is not overwritten.
        await this.db.update(automations).set({status:'ACCEPTED', variables:{...(automation.variables||{}),__meta_message_status:'unknown',__delivery_note:note},
          errorMessage:note,executedAt:new Date(),updatedAt:new Date()})
          .where(and(eq(automations.id,automation.id),eq(automations.status,'PROCESSING')));
        console.warn('[Worker] Attempt needs delivery reconciliation:', automation.id, error?.message);
        res = {status:'ACCEPTED',errorMessage:note};
      }
      if (res.status === 'SCHEDULED') {
        deferredCount++;
      } else if (['ACCEPTED','SENT'].includes(res.status)) {
        successCount++;
      } else {
        failureCount++;
      }
      details.push({
        id: automation.id,
        contactName: contact.name,
        status: res.status,
        error: res.errorMessage,
      });
    }

    return {
      processed: details.length,
      successCount,
      failureCount,
      deferredCount,
      details,
      message: `Processed ${details.length} automation(s): ${successCount} accepted for delivery, ${failureCount} failed, ${deferredCount} deferred for rate limits.`,
    };
  }

  private async processLocalStoreAutomations(
    now: Date,
    forceId?: number,
    forceAll?: boolean,
    allowSimulation?: boolean
  ): Promise<WorkerRunResult> {
    const dueJobs = localStore.automations.filter((a) => {
      if (forceId) return a.id === forceId && a.status === 'SCHEDULED';
      if (forceAll) return a.status === 'SCHEDULED';
      return a.status === 'SCHEDULED' && new Date(a.scheduledAt) <= now;
    });

    if (dueJobs.length === 0) {
      return { processed: 0, successCount: 0, failureCount: 0, message: 'No due automations in local queue.' };
    }

    console.log(`[Worker] Found ${dueJobs.length} due automation(s) in local store.`);
    let successCount = 0;
    let failureCount = 0;
    const details: Array<{ id: number; contactName: string; status: string; error?: string }> = [];

    for (const job of dueJobs) {
      job.status = 'PROCESSING';
      job.lockedAt = new Date();
      job.updatedAt = new Date();

      const contact = localStore.contacts.find((c) => c.id === job.contactId);
      if (!contact) {
        job.status = 'FAILED';
        job.errorMessage = 'Contact not found.';
        failureCount++;
        details.push({ id: job.id, contactName: 'Unknown contact', status: 'FAILED', error: job.errorMessage });
        continue;
      }

      const template = localStore.templates.find((t) => t.id === job.templateId) || {
        id: job.templateId,
        name: 'hello_world',
        status: 'APPROVED',
        language: 'en_US',
        category: 'UTILITY',
        components: [],
        metaTemplateId: 'meta_tpl_hello_world',
        variableCount: 0,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = localStore.account;
      const res = await this.executeJobLocal(job, contact, template, account, allowSimulation);
      if (['ACCEPTED','SENT'].includes(res.status)) {
        successCount++;
      } else {
        failureCount++;
      }
      details.push({
        id: job.id,
        contactName: contact.name,
        status: res.status,
        error: res.errorMessage,
      });
    }

    return {
      processed: dueJobs.length,
      successCount,
      failureCount,
      details,
      message: `Processed ${dueJobs.length} local automation(s): ${successCount} accepted for delivery, ${failureCount} failed.`,
    };
  }

  private async executeJob(
    automation: typeof automations.$inferSelect,
    contact: typeof contacts.$inferSelect,
    template: typeof messageTemplates.$inferSelect,
    account?: typeof whatsappAccounts.$inferSelect,
    allowSimulation: boolean = false
  ): Promise<{ status: string; errorMessage?: string }> {
    const now = new Date();
    const owner=await pool.query('SELECT is_active,approval_status FROM users WHERE id=$1',[automation.ownerUserId]);
    if(!owner.rows[0]?.is_active || !['ACTIVE','APPROVED'].includes(owner.rows[0]?.approval_status)) {
      const errorMessage='Business account is inactive. Automation stopped.';
      await this.db.update(automations).set({status:'CANCELLED',errorMessage,updatedAt:now}).where(eq(automations.id,automation.id));
      return {status:'CANCELLED',errorMessage};
    }

    // Validation 1: Verify contact opt-in
    if (!contact.optIn) {
      const errorMsg = `Contact ${contact.name} (${contact.phone}) has opted out of WhatsApp messages.`;
      await this.db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await this.db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Validation 2: Verify template approval
    if (template.status !== 'APPROVED') {
      const errorMsg = `Template '${template.name}' is not in APPROVED status (current: ${template.status}).`;
      await this.db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await this.db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    const snapshot=automation.templateSnapshot as any;
    if(snapshot?.components && semanticComponents(snapshot.components)!==semanticComponents(template.components as any[])) {
      const errorMsg='Template content changed after this message was scheduled. Review the current approved template and schedule a new message.';
      await this.db.update(automations).set({status:'FAILED',errorMessage:errorMsg,executedAt:now,updatedAt:now}).where(eq(automations.id,automation.id));
      return {status:'FAILED',errorMessage:errorMsg};
    }

    // A separate marketing attempt may have failed after this job was queued.
    // Do not hammer the same recipient or stop other recipients' jobs.
    if (template.category === 'MARKETING') {
      const restrictions = await this.db.select().from(messages).where(and(
        eq(messages.ownerUserId,automation.ownerUserId),eq(messages.contactId,contact.id),
        eq(messages.errorCode,'131049'),gte(messages.failedAt,new Date(Date.now()-86400000))));
      const retryAfter = restrictions.map(row=>marketingRetryAfter(row)).filter((d):d is Date=>!!d)
        .sort((a,b)=>b.getTime()-a.getTime())[0];
      if (retryAfter) {
        await this.db.update(automations).set({status:'FAILED',errorMessage:marketingLimitMessage,
          variables:{...(automation.variables||{}),__marketing_retry_after:retryAfter.toISOString()},executedAt:now,updatedAt:now})
          .where(eq(automations.id,automation.id));
        return {status:'FAILED',errorMessage:marketingLimitMessage};
      }
    }

    // Validation 3: Package and message quota are rechecked at execution time.
    try {
      await assertMessageCapacity(automation.ownerUserId, 1, { reserveScheduled: false });
    } catch (quotaError: any) {
      const errorMsg = quotaError?.message || 'Active package/message quota required.';
      await this.db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await this.db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      await createNotification({ userId: automation.ownerUserId, targetRole: 'BUSINESS', type: 'BILLING', title: 'Automation blocked by package limit', message: errorMsg, entityType: 'AUTOMATION', entityId: automation.id });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Validation 4: Check WhatsApp credentials
    const creds = await resolveWhatsAppCredentials(automation.ownerUserId);
    const effectivePhoneId = creds.phoneNumberId;
    const effectiveToken = creds.accessToken;
    const effectiveVersion = creds.apiVersion || 'v21.0';
    const hasCredentials = Boolean(effectivePhoneId && effectiveToken);

    if (!hasCredentials) {
      if (allowSimulation) {
        // Run simulated delivery
        const simulatedWamid = `wamid.HBg${Date.now()}_simulated`;
        const simNote = 'Sandbox Simulation: Processed locally without Meta API credentials. Not sent to physical mobile device.';
        await this.db.update(automations).set({ status: 'SIMULATED', executedAt: now, errorMessage: simNote, updatedAt: now }).where(eq(automations.id, automation.id));
        await this.db.insert(messages).values({
          automationId: automation.id,
          contactId: contact.id,
          ownerUserId: automation.ownerUserId,
          direction: 'OUTBOUND',
          messageType: 'TEMPLATE',
          content: renderTemplateMessageContent(template, automation.variables),
          templateName: template.name,
          templateLanguage: template.language,
          variables: automation.variables,
          whatsappMessageId: simulatedWamid,
          status: 'SIMULATED',
          sentAt: null,
        });
        await this.db.insert(automationExecutions).values({
          automationId: automation.id,
          status: 'SIMULATED',
          responsePayload: { simulated: true, wamid: simulatedWamid, note: simNote },
          executedAt: now,
        });
        return { status: 'SIMULATED', errorMessage: simNote };
      }

      let errorMsg = 'WhatsApp Business API credentials are not configured in settings. Go to WhatsApp Settings to add your Phone Number ID and Access Token to deliver to real phones.';
      if (creds.hasToken && !creds.hasPhoneId) {
        errorMsg = 'Access Token is saved for this business, but Phone Number ID is missing. Please complete WhatsApp Settings.';
      }

      await this.db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await this.db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Repair delivery routing without blocking a valid messaging-only token.
    const tracking=await prepareDeliveryTracking(creds);
    // Call live Meta WhatsApp API
    const sendResult = await WhatsAppService.sendTemplateMessage({
      phoneNumberId: effectivePhoneId!,
      accessToken: effectiveToken!,
      apiVersion: effectiveVersion,
      recipientPhone: contact.phone,
      templateName: template.name,
      templateLanguage: template.language,
      variables: automation.variables || {},
      templateComponents: template.components as any[],
      trackingId: `greetsync:${automation.ownerUserId}:${automation.id}`,
    });

    const retry = !sendResult.success && sendResult.rawResponse?.error
      ? sendRetryPlan(sendResult.errorCode, automation.variables) : null;
    if (retry) {
      await this.db.update(automations).set({status:'SCHEDULED',scheduledAt:retry.scheduledAt,
        variables:retry.variables,lockedAt:null,errorMessage:'WhatsApp rate limit. This queued message will retry automatically.',updatedAt:new Date()})
        .where(and(eq(automations.id,automation.id),eq(automations.status,'PROCESSING')));
      return {status:'SCHEDULED'};
    }

    if(sendResult.errorCode==='SEND_OUTCOME_UNKNOWN') {
      const completedAt=new Date();
      const vars={...(automation.variables||{}),__meta_message_status:'unknown',__delivery_note:sendResult.error!};
      await this.db.transaction(async tx=>{
        await tx.insert(messages).values({ownerUserId:automation.ownerUserId,automationId:automation.id,contactId:contact.id,direction:'OUTBOUND',messageType:'TEMPLATE',templateName:template.name,templateLanguage:template.language,variables:vars,status:'ACCEPTED',errorCode:sendResult.errorCode,errorMessage:sendResult.error,sentAt:null});
        await tx.update(automations).set({status:'ACCEPTED',variables:vars,executedAt:completedAt,errorMessage:sendResult.error,updatedAt:completedAt}).where(eq(automations.id,automation.id));
      });
      return {status:'ACCEPTED',errorMessage:sendResult.error};
    }

    if (sendResult.success && sendResult.whatsappMessageId) {
      const actualTemplateSent = sendResult.fellBackToHelloWorld ? 'hello_world' : template.name;
      const actualTemplateLang = sendResult.fellBackToHelloWorld ? 'en_US' : template.language;
      const successNote = sendResult.fallbackNote || null;

      const completedAt=new Date();
      const savedVars=acceptanceVariables((automation.variables||{}) as Record<string,string>,sendResult.rawResponse,tracking.warning);
      await this.db.transaction(async tx=>{
      await tx.update(automations).set({ status: 'ACCEPTED', variables: savedVars, executedAt: completedAt, errorMessage: successNote, updatedAt: completedAt }).where(eq(automations.id, automation.id));
      await tx.insert(messages).values({
        automationId: automation.id,
        contactId: contact.id,
        ownerUserId: automation.ownerUserId,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        content: sendResult.fellBackToHelloWorld ? 'Hello World' : renderTemplateMessageContent(template, automation.variables),
        templateName: actualTemplateSent,
        templateLanguage: actualTemplateLang,
        variables: savedVars,
        whatsappMessageId: sendResult.whatsappMessageId,
        status: 'ACCEPTED',
        sentAt: null,
      });
      await tx.insert(automationExecutions).values({
        automationId: automation.id,
        status: 'SUCCESS',
        responsePayload: sendResult.rawResponse,
        executedAt: completedAt,
      });
      });
      await createNotification({
        userId: automation.ownerUserId,
        targetRole: 'BUSINESS',
        type: 'MESSAGE',
        title: 'Message accepted by WhatsApp',
        message: `${actualTemplateSent} is awaiting delivery to ${contact.name}.`,
        entityType: 'AUTOMATION',
        entityId: automation.id,
      });

      // If this was a birthday automation, record history & schedule next year automatically
      const vars = (automation.variables || {}) as any;
      if (vars._isBirthday === 'true') {
        const completedYear = parseInt(vars._birthdayYear || String(now.getFullYear()), 10);
        WishflowService.handleBirthdayAutomationCompleted({
          automationId: automation.id,
          contactId: contact.id,
          completedYear,
          status: 'ACCEPTED',
          templateName: actualTemplateSent,
          messageText: vars._customMessage,
        }).catch((err) => console.warn('[Worker] Birthday wish cycle completion hook failed:', err));
      }

      return { status: 'ACCEPTED' };
    } else {
      const errorMsg = sendResult.error || 'Meta API error sending template message';
      await this.db.update(automations).set({ status: 'FAILED', executedAt: now, errorMessage: errorMsg, updatedAt: now }).where(eq(automations.id, automation.id));
      await this.db.insert(messages).values({
        automationId: automation.id,
        contactId: contact.id,
        ownerUserId: automation.ownerUserId,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        content: renderTemplateMessageContent(template, automation.variables),
        templateName: template.name,
        templateLanguage: template.language,
        variables: automation.variables,
        status: 'FAILED',
        errorCode: sendResult.errorCode || 'META_API_ERROR',
        errorMessage: errorMsg,
        failedAt: now,
      });
      await this.db.insert(automationExecutions).values({
        automationId: automation.id,
        status: 'FAILED',
        errorMessage: errorMsg,
        responsePayload: sendResult.rawResponse,
        executedAt: now,
      });
      await createNotification({
        userId: automation.ownerUserId,
        targetRole: 'BUSINESS',
        type: 'ERROR',
        title: 'Message failed',
        message: `GreetSync could not send ${template.name} to ${contact.name}: ${errorMsg}`,
        entityType: 'AUTOMATION',
        entityId: automation.id,
      });
      await createNotification({
        targetRole: 'ADMIN',
        type: 'ERROR',
        title: 'Business automation failed',
        message: `Automation #${automation.id} failed for business user ${automation.ownerUserId}: ${errorMsg}`,
        entityType: 'AUTOMATION',
        entityId: automation.id,
      });
      return { status: 'FAILED', errorMessage: errorMsg };
    }
  }

  private async executeJobLocal(
    job: any,
    contact: any,
    template: any,
    account: any,
    allowSimulation: boolean = false
  ): Promise<{ status: string; errorMessage?: string }> {
    const now = new Date();

    if (!contact.optIn) {
      const errorMsg = `Contact ${contact.name} (${contact.phone}) has opted out of WhatsApp messages.`;
      job.status = 'FAILED';
      job.errorMessage = errorMsg;
      job.executedAt = now;
      job.updatedAt = now;
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    if (template.status !== 'APPROVED') {
      const errorMsg = `Template '${template.name}' is not in APPROVED status (current: ${template.status}).`;
      job.status = 'FAILED';
      job.errorMessage = errorMsg;
      job.executedAt = now;
      job.updatedAt = now;
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    const creds = await resolveWhatsAppCredentials(job.ownerUserId || 0);
    const effectivePhoneId = creds.phoneNumberId;
    const effectiveToken = creds.accessToken;
    const effectiveVersion = creds.apiVersion || 'v21.0';
    const hasCredentials = Boolean(effectivePhoneId && effectiveToken);

    if (!hasCredentials) {
      if (allowSimulation) {
        const simulatedWamid = `wamid.HBg${Date.now()}_simulated`;
        const simNote = 'Sandbox Simulation: Processed locally without Meta API credentials. Not sent to physical mobile device.';
        job.status = 'SIMULATED';
        job.errorMessage = simNote;
        job.executedAt = now;
        job.updatedAt = now;

        localStore.messages.unshift({
          id: localStore.nextMessageId++,
          automationId: job.id,
          contactId: contact.id,
          ownerUserId: job.ownerUserId || 0,
          direction: 'OUTBOUND',
          messageType: 'TEMPLATE',
          content: renderTemplateMessageContent(template, job.variables),
          templateName: template.name,
          templateLanguage: template.language,
          variables: job.variables,
          whatsappMessageId: simulatedWamid,
          status: 'SIMULATED',
          sentAt: null,
        });

        return { status: 'SIMULATED', errorMessage: simNote };
      }

      let errorMsg = 'WhatsApp API credentials are not configured in settings. Go to WhatsApp Settings to add your Phone Number ID & Access Token to send to real phones.';
      if (creds.hasToken && !creds.hasPhoneId) {
        errorMsg = 'Access Token is saved for this business, but Phone Number ID is missing. Please complete WhatsApp Settings.';
      }

      job.status = 'FAILED';
      job.errorMessage = errorMsg;
      job.executedAt = now;
      job.updatedAt = now;
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Call Meta Cloud API
    const sendResult = await WhatsAppService.sendTemplateMessage({
      phoneNumberId: effectivePhoneId!,
      accessToken: effectiveToken!,
      apiVersion: effectiveVersion,
      recipientPhone: contact.phone,
      templateName: template.name,
      templateLanguage: template.language,
      variables: job.variables || {},
      templateComponents: Array.isArray(template.components) ? template.components : [],
    });

    if (sendResult.success && sendResult.whatsappMessageId) {
      const actualTemplateSent = sendResult.fellBackToHelloWorld ? 'hello_world' : template.name;
      const actualTemplateLang = sendResult.fellBackToHelloWorld ? 'en_US' : template.language;
      const successNote = sendResult.fallbackNote || null;

      job.status = 'ACCEPTED';
      job.executedAt = now;
      job.errorMessage = successNote;
      job.updatedAt = now;

      localStore.messages.unshift({
        id: localStore.nextMessageId++,
        automationId: job.id,
        contactId: contact.id,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        content: sendResult.fellBackToHelloWorld ? 'Hello World' : renderTemplateMessageContent(template, job.variables),
        templateName: actualTemplateSent,
        templateLanguage: actualTemplateLang,
        variables: job.variables,
        whatsappMessageId: sendResult.whatsappMessageId,
        status: 'ACCEPTED',
        sentAt: null,
      });

      // If this was a birthday automation, record history & schedule next year automatically
      const vars = (job.variables || {}) as any;
      if (vars._isBirthday === 'true') {
        const completedYear = parseInt(vars._birthdayYear || String(now.getFullYear()), 10);
        WishflowService.handleBirthdayAutomationCompleted({
          automationId: job.id,
          contactId: contact.id,
          completedYear,
          status: 'ACCEPTED',
          templateName: actualTemplateSent,
          messageText: vars._customMessage,
        }).catch((err) => console.warn('[Worker] Local birthday wish cycle completion hook failed:', err));
      }

      return { status: 'ACCEPTED' };
    } else {
      const errorMsg = sendResult.error || 'Failed sending template message via Meta API';
      job.status = 'FAILED';
      job.executedAt = now;
      job.errorMessage = errorMsg;
      job.updatedAt = now;
      return { status: 'FAILED', errorMessage: errorMsg };
    }
  }
}

export const automationWorker = new AutomationWorker();
