import { and, eq, lte, isNull, or } from 'drizzle-orm';
import { db, isDatabaseConnected } from '../db/index.ts';
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

export interface WorkerRunResult {
  processed: number;
  successCount: number;
  failureCount: number;
  message?: string;
  details?: Array<{
    id: number;
    contactName: string;
    status: string;
    error?: string;
  }>;
}

class AutomationWorker {
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

    const dueJobs = await db
      .select({
        automation: automations,
        contact: contacts,
        template: messageTemplates,
      })
      .from(automations)
      .innerJoin(contacts, eq(automations.contactId, contacts.id))
      .innerJoin(messageTemplates, eq(automations.templateId, messageTemplates.id))
      .where(whereClause)
      .limit(10);

    if (dueJobs.length === 0) {
      return { processed: 0, successCount: 0, failureCount: 0, message: 'No due automations in database queue.' };
    }

    let successCount = 0;
    let failureCount = 0;
    const details: Array<{ id: number; contactName: string; status: string; error?: string }> = [];

    for (const job of dueJobs) {
      const { automation, contact, template } = job;

      // Hard tenant boundary: an automation may only use contacts/templates owned by
      // the same business account. This prevents accidental cross-business sends even
      // if database rows were corrupted or an ID was tampered with.
      if (automation.ownerUserId !== contact.ownerUserId || automation.ownerUserId !== template.ownerUserId) {
        const errorMsg = 'Tenant ownership mismatch. Automation, contact and template must belong to the same business.';
        await db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
        await db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
        failureCount++;
        details.push({ id: automation.id, contactName: contact.name, status: 'FAILED', error: errorMsg });
        continue;
      }

      // Lock job
      const lockResult = await db
        .update(automations)
        .set({
          status: 'PROCESSING',
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

      const res = await this.executeJob(automation, contact, template, undefined, allowSimulation);
      if (res.status === 'SENT') {
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
      processed: dueJobs.length,
      successCount,
      failureCount,
      details,
      message: `Processed ${dueJobs.length} automation(s): ${successCount} sent, ${failureCount} failed.`,
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
      if (res.status === 'SENT') {
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
      message: `Processed ${dueJobs.length} local automation(s): ${successCount} sent, ${failureCount} failed.`,
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

    // Validation 1: Verify contact opt-in
    if (!contact.optIn) {
      const errorMsg = `Contact ${contact.name} (${contact.phone}) has opted out of WhatsApp messages.`;
      await db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Validation 2: Verify template approval
    if (template.status !== 'APPROVED') {
      const errorMsg = `Template '${template.name}' is not in APPROVED status (current: ${template.status}).`;
      await db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Validation 3: Check WhatsApp credentials
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
        await db.update(automations).set({ status: 'SIMULATED', executedAt: now, errorMessage: simNote, updatedAt: now }).where(eq(automations.id, automation.id));
        await db.insert(messages).values({
          automationId: automation.id,
          contactId: contact.id,
          ownerUserId: automation.ownerUserId,
          direction: 'OUTBOUND',
          messageType: 'TEMPLATE',
          templateName: template.name,
          templateLanguage: template.language,
          variables: automation.variables,
          whatsappMessageId: simulatedWamid,
          status: 'SIMULATED',
          sentAt: now,
        });
        await db.insert(automationExecutions).values({
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

      await db.update(automations).set({ status: 'FAILED', errorMessage: errorMsg, executedAt: now, updatedAt: now }).where(eq(automations.id, automation.id));
      await db.insert(automationExecutions).values({ automationId: automation.id, status: 'FAILED', errorMessage: errorMsg, executedAt: now });
      return { status: 'FAILED', errorMessage: errorMsg };
    }

    // Call live Meta WhatsApp API
    const sendResult = await WhatsAppService.sendTemplateMessage({
      phoneNumberId: effectivePhoneId!,
      accessToken: effectiveToken!,
      apiVersion: effectiveVersion,
      recipientPhone: contact.phone,
      templateName: template.name,
      templateLanguage: template.language,
      variables: automation.variables || {},
    });

    if (sendResult.success && sendResult.whatsappMessageId) {
      const actualTemplateSent = sendResult.fellBackToHelloWorld ? 'hello_world' : template.name;
      const actualTemplateLang = sendResult.fellBackToHelloWorld ? 'en_US' : template.language;
      const successNote = sendResult.fallbackNote || null;

      await db.update(automations).set({ status: 'SENT', executedAt: now, errorMessage: successNote, updatedAt: now }).where(eq(automations.id, automation.id));
      await db.insert(messages).values({
        automationId: automation.id,
        contactId: contact.id,
        ownerUserId: automation.ownerUserId,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        templateName: actualTemplateSent,
        templateLanguage: actualTemplateLang,
        variables: automation.variables,
        whatsappMessageId: sendResult.whatsappMessageId,
        status: 'SENT',
        sentAt: now,
      });
      await db.insert(automationExecutions).values({
        automationId: automation.id,
        status: 'SUCCESS',
        responsePayload: sendResult.rawResponse,
        executedAt: now,
      });

      // If this was a birthday automation, record history & schedule next year automatically
      const vars = (automation.variables || {}) as any;
      if (vars._isBirthday === 'true') {
        const completedYear = parseInt(vars._birthdayYear || String(now.getFullYear()), 10);
        WishflowService.handleBirthdayAutomationCompleted({
          automationId: automation.id,
          contactId: contact.id,
          completedYear,
          status: 'SENT',
          templateName: actualTemplateSent,
          messageText: vars._customMessage,
        }).catch((err) => console.warn('[Worker] Birthday wish cycle completion hook failed:', err));
      }

      return { status: 'SENT' };
    } else {
      const errorMsg = sendResult.error || 'Meta API error sending template message';
      await db.update(automations).set({ status: 'FAILED', executedAt: now, errorMessage: errorMsg, updatedAt: now }).where(eq(automations.id, automation.id));
      await db.insert(messages).values({
        automationId: automation.id,
        contactId: contact.id,
        ownerUserId: automation.ownerUserId,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        templateName: template.name,
        templateLanguage: template.language,
        variables: automation.variables,
        status: 'FAILED',
        errorCode: sendResult.errorCode || 'META_API_ERROR',
        errorMessage: errorMsg,
        failedAt: now,
      });
      await db.insert(automationExecutions).values({
        automationId: automation.id,
        status: 'FAILED',
        errorMessage: errorMsg,
        responsePayload: sendResult.rawResponse,
        executedAt: now,
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
          templateName: template.name,
          templateLanguage: template.language,
          variables: job.variables,
          whatsappMessageId: simulatedWamid,
          status: 'SIMULATED',
          sentAt: now,
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
    });

    if (sendResult.success && sendResult.whatsappMessageId) {
      const actualTemplateSent = sendResult.fellBackToHelloWorld ? 'hello_world' : template.name;
      const actualTemplateLang = sendResult.fellBackToHelloWorld ? 'en_US' : template.language;
      const successNote = sendResult.fallbackNote || null;

      job.status = 'SENT';
      job.executedAt = now;
      job.errorMessage = successNote;
      job.updatedAt = now;

      localStore.messages.unshift({
        id: localStore.nextMessageId++,
        automationId: job.id,
        contactId: contact.id,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        templateName: actualTemplateSent,
        templateLanguage: actualTemplateLang,
        variables: job.variables,
        whatsappMessageId: sendResult.whatsappMessageId,
        status: 'SENT',
        sentAt: now,
      });

      // If this was a birthday automation, record history & schedule next year automatically
      const vars = (job.variables || {}) as any;
      if (vars._isBirthday === 'true') {
        const completedYear = parseInt(vars._birthdayYear || String(now.getFullYear()), 10);
        WishflowService.handleBirthdayAutomationCompleted({
          automationId: job.id,
          contactId: contact.id,
          completedYear,
          status: 'SENT',
          templateName: actualTemplateSent,
          messageText: vars._customMessage,
        }).catch((err) => console.warn('[Worker] Local birthday wish cycle completion hook failed:', err));
      }

      return { status: 'SENT' };
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
