import { businessVariableValue } from './business-variables.ts';
import { eq, and, desc, isNull, or, sql } from 'drizzle-orm';
import { db, isDatabaseConnected } from '../db/index.ts';
import {
  contacts,
  automations,
  messageTemplates,
  messages,
  whatsappAccounts,
  users,
} from '../db/schema.ts';
import { localStore } from '../db/localStore.ts';
import { WhatsAppService } from './whatsapp.ts';
import { resolveWhatsAppCredentials } from './credentials.ts';
import { assertAutomationCapacity, assertMessageCapacity } from './subscriptions.ts';
import {
  BirthdaySettings,
  BirthdayWishContactSummary,
  BirthdayWishHistoryItem,
} from '../types.ts';

export class WishflowService {
  /**
   * Retrieves the global Birthday Automation configuration
   */
  static getSettings(): BirthdaySettings {
    return {
      enabled: localStore.birthdaySettings.enabled,
      defaultSendTime: localStore.birthdaySettings.defaultSendTime || '09:00',
      defaultTemplateId: localStore.birthdaySettings.defaultTemplateId || 1,
      customMessage:
        localStore.birthdaySettings.customMessage ||
        '🎉 Happy Birthday {{name}}! Wishing you a fantastic year filled with happiness, health, and success! 🎂🎈',
      timezone: localStore.birthdaySettings.timezone || 'Asia/Kolkata',
    };
  }

  /**
   * Updates the global Birthday Automation configuration and optionally resyncs
   */
  static async updateSettings(
    newSettings: Partial<BirthdaySettings>
  ): Promise<BirthdaySettings> {
    if (newSettings.enabled !== undefined) {
      localStore.birthdaySettings.enabled = Boolean(newSettings.enabled);
    }
    if (newSettings.defaultSendTime) {
      localStore.birthdaySettings.defaultSendTime = newSettings.defaultSendTime.trim();
    }
    if (newSettings.defaultTemplateId) {
      localStore.birthdaySettings.defaultTemplateId = Number(newSettings.defaultTemplateId);
    }
    if (newSettings.customMessage) {
      localStore.birthdaySettings.customMessage = newSettings.customMessage;
    }
    if (newSettings.timezone) {
      localStore.birthdaySettings.timezone = newSettings.timezone.trim();
    }

    // Trigger background sync across contacts
    await this.syncAllContactsBirthdays().catch((err) => {
      console.warn('[GreetSync] Background sync error after settings update:', err);
    });

    return this.getSettings();
  }

  /**
   * Calculates the exact next birthday Date, target year, turning age, and day distance
   */
  static calculateNextBirthday(
    dobString: string,
    sendTimeStr: string = '09:00',
    now: Date = new Date()
  ): {
    birthYear: number;
    birthMonth: number;
    birthDay: number;
    targetYear: number;
    targetDate: Date;
    ageTurning: number;
    daysUntilBirthday: number;
    isToday: boolean;
    isThisMonth: boolean;
    formattedNextDate: string;
  } {
    const cleanDob = (dobString || '').trim();
    const parts = cleanDob.split(/[-/]/);
    const birthYear = parseInt(parts[0], 10) || 1990;
    const birthMonth = parseInt(parts[1], 10) || 1;
    const birthDay = parseInt(parts[2], 10) || 1;

    const timeParts = (sendTimeStr || '09:00').split(':');
    const sendHour = parseInt(timeParts[0], 10) || 9;
    const sendMinute = parseInt(timeParts[1], 10) || 0;

    const currentYear = now.getFullYear();

    // Check if birthday for current year is today or upcoming
    // Handle leap year Feb 29 on non-leap years (use Feb 28)
    const getSafeDate = (year: number, month: number, day: number, hour: number, min: number) => {
      if (month === 2 && day === 29) {
        const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        return new Date(year, 1, isLeap ? 29 : 28, hour, min, 0, 0);
      }
      return new Date(year, month - 1, day, hour, min, 0, 0);
    };

    let targetYear = currentYear;
    let targetDate = getSafeDate(currentYear, birthMonth, birthDay, sendHour, sendMinute);

    // If today is their birthday date (ignoring time)
    const isToday = now.getMonth() + 1 === birthMonth && now.getDate() === birthDay;
    const isThisMonth = now.getMonth() + 1 === birthMonth;

    // If birthday date has already completely passed this calendar year (and is not today)
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const thisYearBdayZero = new Date(currentYear, birthMonth - 1, birthDay).getTime();

    if (thisYearBdayZero < todayZero) {
      // Birthday already occurred earlier this year, target next year
      targetYear = currentYear + 1;
      targetDate = getSafeDate(targetYear, birthMonth, birthDay, sendHour, sendMinute);
    }

    const ageTurning = targetYear - birthYear;

    // Calculate days until birthday
    const nextBdayZero = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    const diffMs = nextBdayZero - todayZero;
    const daysUntilBirthday = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const formattedNextDate = `${yyyy}-${mm}-${dd}`;

    return {
      birthYear,
      birthMonth,
      birthDay,
      targetYear,
      targetDate,
      ageTurning,
      daysUntilBirthday,
      isToday,
      isThisMonth,
      formattedNextDate,
    };
  }

  /**
   * Syncs the scheduled birthday automation for a specific contact.
   * Prevents duplicate messages for the same contact in the same year.
   */
  static async syncContactBirthdayAutomation(contactId: number): Promise<{
    scheduled: boolean;
    automationId?: number;
    message?: string;
  }> {
    const settings = this.getSettings();

    // 1. Fetch contact
    let contact: any = null;
    if (isDatabaseConnected) {
      try {
        const rows = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
        contact = rows[0];
      } catch (err) {
        // Fallback to local store
      }
    }
    if (!contact) {
      contact = localStore.contacts.find((c) => c.id === contactId);
    }

    if (!contact) {
      return { scheduled: false, message: 'Contact not found' };
    }

    if (!contact.dob) {
      return { scheduled: false, message: 'Contact does not have a Date of Birth specified' };
    }

    // 2. Check if birthday automation is enabled for this contact and globally
    const isContactEnabled = contact.birthdayAutomationEnabled !== false;
    if (!settings.enabled || !isContactEnabled) {
      return { scheduled: false, message: 'Birthday automation is disabled' };
    }

    // 3. Compute target birthday
    const bday = this.calculateNextBirthday(contact.dob, settings.defaultSendTime);
    const targetYear = bday.targetYear;
    const targetDate = bday.targetDate;

    // 4. Check for existing automation for this contact in the target year to PREVENT DUPLICATES
    const existing = await this.findExistingBirthdayAutomation(contact.id, targetYear);
    if (existing) {
      // If already scheduled, ensure scheduled time is aligned
      if (existing.status === 'SCHEDULED' || existing.status === 'FAILED') {
        return {
          scheduled: true,
          automationId: existing.id,
          message: `Birthday wish already scheduled for ${targetYear}`,
        };
      }
      if (existing.status === 'ACCEPTED' || existing.status === 'READ' || existing.status === 'SENT' || existing.status === 'DELIVERED' || existing.status === 'SIMULATED') {
        return {
          scheduled: false,
          automationId: existing.id,
          message: `Birthday wish already completed for ${targetYear}`,
        };
      }
    }

    // 5. Build template variables & message
    const personalizedMessage = settings.customMessage
      .replace(/{{name}}/g, contact.name)
      .replace(/{{age}}/g, String(bday.ageTurning));

    const templateVariables: Record<string, string> = {
      _isBirthday: 'true',
      _birthdayYear: String(targetYear),
      _contactName: contact.name,
      _customMessage: personalizedMessage,
    };

    // 6. Resolve the approved Birthday template dynamically. Older builds used
    // a hard-coded template id, which could point at a removed demo template.
    let effectiveTemplateId = 0;
    let effectiveTemplateComponents: any[] = [];
    if (isDatabaseConnected) {
      const candidates = await db
        .select({ id: messageTemplates.id, ownerUserId: messageTemplates.ownerUserId, components: messageTemplates.components })
        .from(messageTemplates)
        .where(and(
          eq(messageTemplates.status, 'APPROVED'),
          or(
            eq(messageTemplates.name, 'birthday'),
            eq(messageTemplates.name, 'happy_birthday_wishes'),
            sql`${messageTemplates.name} ILIKE ${'%birthday%'}`,
          ),
          eq(messageTemplates.ownerUserId, contact.ownerUserId),
        ));
      const chosen = candidates.find((t) => t.ownerUserId === contact.ownerUserId);
      effectiveTemplateId = chosen?.id || 0;
      effectiveTemplateComponents = Array.isArray(chosen?.components) ? chosen!.components as any[] : [];
    }

    if (!effectiveTemplateId) {
      return { scheduled: false, message: 'No approved Birthday template is available' };
    }

    const business = isDatabaseConnected
      ? (await db.select().from(users).where(eq(users.id,contact.ownerUserId)).limit(1))[0]
      : null;
    // Fill birthday-template variables automatically from the contact. Meta
    // review examples are never used as customer data.
    for (const component of effectiveTemplateComponents) {
      const section = String(component?.type || '').toUpperCase();
      if (section !== 'HEADER' && section !== 'BODY') continue;
      const text = String(component?.text || '');
      const meanings = component?.greetsync_variable_meanings && typeof component.greetsync_variable_meanings === 'object'
        ? component.greetsync_variable_meanings as Record<string, unknown>
        : {};
      const seen = new Set<string>();
      for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        const token = String(match[1] || '').trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        const lowerToken = token.toLowerCase();
        let meaning = String(meanings[token] || '').toUpperCase();
        if (!meaning) {
          if (lowerToken.includes('name') || token === '1') meaning = 'CONTACT_NAME';
          else if (lowerToken.includes('age') || token === '2') meaning = 'AGE';
          else if (lowerToken.includes('phone') || lowerToken.includes('mobile')) meaning = 'PHONE';
          else if (lowerToken.includes('email')) meaning = 'EMAIL';
          else if (lowerToken.includes('birth') || lowerToken === 'dob') meaning = 'BIRTHDAY_DATE';
        }
        let value = businessVariableValue(meaning,business) || '';
        if (meaning === 'CONTACT_NAME') value = String(contact.name || '').trim();
        else if (meaning === 'FIRST_NAME') value = String(contact.name || '').trim().split(/\s+/)[0] || '';
        else if (meaning === 'AGE') value = String(bday.ageTurning);
        else if (meaning === 'PHONE') value = String(contact.phone || '').trim();
        else if (meaning === 'EMAIL') value = String(contact.email || '').trim();
        else if (meaning === 'BIRTHDAY_DATE') value = String(contact.dob || '').split('-').reverse().join('-');
        else if (meaning === 'SCHEDULED_DATE') value = `${String(targetDate.getDate()).padStart(2,'0')}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${targetDate.getFullYear()}`;
        else if (meaning === 'SCHEDULED_TIME') value = `${String(targetDate.getHours()).padStart(2,'0')}:${String(targetDate.getMinutes()).padStart(2,'0')}`;
        else if (meaning === 'SCHEDULED_DATE_TIME') value = `${String(targetDate.getDate()).padStart(2,'0')}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${targetDate.getFullYear()} ${String(targetDate.getHours()).padStart(2,'0')}:${String(targetDate.getMinutes()).padStart(2,'0')}`;
        if (!value) return { scheduled: false, message: `Birthday template variable {{${token}}} requires ${meaning || 'custom'} information that cannot be filled automatically.` };
        const key = section === 'HEADER' ? `header_${token}` : token;
        templateVariables[key] = value;
      }
    }

    // Birthday jobs consume the same package automation/message quota as manually
    // scheduled jobs. This prevents automatic birthday sync from bypassing plan limits.
    if (isDatabaseConnected && contact.ownerUserId) {
      try {
        await assertAutomationCapacity(contact.ownerUserId, 1);
        await assertMessageCapacity(contact.ownerUserId, 1, { reserveScheduled: true, scheduledAt: targetDate });
      } catch (quotaError: any) {
        return { scheduled: false, message: quotaError?.message || 'Package quota does not allow another birthday automation.' };
      }
    }

    if (isDatabaseConnected) {
      try {
        const inserted = await db
          .insert(automations)
          .values({
            ownerUserId: contact.ownerUserId,
            contactId: contact.id,
            templateId: effectiveTemplateId,
            variables: templateVariables,
            scheduledAt: targetDate,
            timezone: settings.timezone,
            status: 'SCHEDULED',
          })
          .returning();

        const newId = inserted[0]?.id;
        console.log(`[GreetSync] Scheduled birthday wish for ${contact.name} on ${targetDate.toISOString()} (Year: ${targetYear}, ID: ${newId})`);
        return { scheduled: true, automationId: newId, message: 'Scheduled successfully' };
      } catch (err: any) {
        console.warn('[GreetSync] Failed to insert into PostgreSQL, inserting into localStore:', err.message);
      }
    }

    // LocalStore insert
    const newId = localStore.nextAutomationId++;
    localStore.automations.push({
      id: newId,
      contactId: contact.id,
      templateId: effectiveTemplateId,
      variables: templateVariables,
      scheduledAt: targetDate,
      timezone: settings.timezone,
      status: 'SCHEDULED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`[GreetSync] Scheduled local birthday wish for ${contact.name} on ${targetDate.toISOString()} (Year: ${targetYear}, ID: ${newId})`);
    return { scheduled: true, automationId: newId, message: 'Scheduled locally' };
  }

  /**
   * Finds an existing birthday automation for a contact in a given year
   */
  private static async findExistingBirthdayAutomation(
    contactId: number,
    year: number
  ): Promise<{ id: number; status: string; scheduledAt: Date } | null> {
    const yearStr = String(year);

    if (isDatabaseConnected) {
      try {
        const rows = await db
          .select()
          .from(automations)
          .where(eq(automations.contactId, contactId));

        for (const row of rows) {
          const vars = row.variables as any;
          if (vars && vars._isBirthday === 'true' && vars._birthdayYear === yearStr) {
            return { id: row.id, status: row.status, scheduledAt: row.scheduledAt };
          }
        }
      } catch {
        // Fallback to local
      }
    }

    const localMatch = localStore.automations.find((a) => {
      if (a.contactId !== contactId) return false;
      const vars = a.variables as any;
      return vars && vars._isBirthday === 'true' && vars._birthdayYear === yearStr;
    });

    if (localMatch) {
      return { id: localMatch.id, status: localMatch.status, scheduledAt: new Date(localMatch.scheduledAt) };
    }

    return null;
  }

  /**
   * Syncs all contacts: detects birthdays and creates/updates scheduled messages
   */
  static async syncAllContactsBirthdays(ownerUserId?: number): Promise<{ synced: number; scheduled: number }> {
    let allContacts: any[] = [];
    if (isDatabaseConnected) {
      try {
        allContacts = ownerUserId ? await db.select().from(contacts).where(eq(contacts.ownerUserId, ownerUserId)) : await db.select().from(contacts);
      } catch {
        allContacts = localStore.contacts;
      }
    } else {
      allContacts = localStore.contacts;
    }

    let scheduledCount = 0;
    for (const contact of allContacts) {
      if (contact.dob) {
        const res = await this.syncContactBirthdayAutomation(contact.id);
        if (res.scheduled) scheduledCount++;
      }
    }

    return { synced: allContacts.length, scheduled: scheduledCount };
  }

  /**
   * Called by the worker once a birthday wish has been completed ('SENT' or 'SIMULATED').
   * Adds to history and automatically schedules the NEXT year's birthday wish!
   */
  static async handleBirthdayAutomationCompleted(params: {
    automationId: number;
    contactId: number;
    completedYear: number;
    status: string;
    templateName?: string;
    messageText?: string;
    errorMessage?: string;
  }): Promise<void> {
    const { automationId, contactId, completedYear, status, templateName, messageText, errorMessage } = params;

    // 1. Fetch contact
    let contact: any = null;
    if (isDatabaseConnected) {
      try {
        const rows = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
        contact = rows[0];
      } catch {}
    }
    if (!contact) {
      contact = localStore.contacts.find((c) => c.id === contactId);
    }

    const contactName = contact?.name || 'Customer';
    const contactPhone = contact?.phone || '';

    // 2. Record to birthday history
    const historyItem: BirthdayWishHistoryItem = {
      id: Date.now(),
      automationId,
      contactId,
      contactName,
      contactPhone,
      year: completedYear,
      scheduledAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
      status,
      templateName: templateName || 'Birthday',
      messagePreview: messageText || 'Happy Birthday!',
      errorMessage,
    };

    localStore.birthdayWishHistory.unshift(historyItem);

    console.log(`[GreetSync] Recorded wish history for ${contactName} (${completedYear}): ${status}`);

    // 3. Automatically schedule the next year's birthday wish to keep the cycle active!
    const nextYear = completedYear + 1;
    if (contact && contact.dob && contact.birthdayAutomationEnabled !== false) {
      setTimeout(async () => {
        try {
          const settings = this.getSettings();
          if (!settings.enabled) return;

          const bday = this.calculateNextBirthday(contact.dob, settings.defaultSendTime);
          // If the computed target year is now nextYear, schedule it
          await this.syncContactBirthdayAutomation(contact.id);
          console.log(`[GreetSync] Next year (${nextYear}) birthday wish scheduled for ${contact.name}`);
        } catch (err: any) {
          console.warn('[GreetSync] Failed to schedule next year birthday:', err?.message);
        }
      }, 1000);
    }
  }

  /**
   * Compiles the comprehensive summary of all contacts with birthdays, next dates, and automation statuses
   */
  static async getBirthdaySummaryList(ownerUserId?: number): Promise<BirthdayWishContactSummary[]> {
    const settings = this.getSettings();
    let allContacts: any[] = [];

    if (isDatabaseConnected) {
      try {
        allContacts = ownerUserId ? await db.select().from(contacts).where(eq(contacts.ownerUserId, ownerUserId)) : await db.select().from(contacts);
      } catch {
        allContacts = localStore.contacts;
      }
    } else {
      allContacts = localStore.contacts;
    }

    // Get all automations
    let allAutomations: any[] = [];
    if (isDatabaseConnected) {
      try {
        allAutomations = ownerUserId ? await db.select().from(automations).where(eq(automations.ownerUserId, ownerUserId)) : await db.select().from(automations);
      } catch {
        allAutomations = localStore.automations;
      }
    } else {
      allAutomations = localStore.automations;
    }

    // Get all templates for name lookup
    let allTemplates: any[] = [];
    if (isDatabaseConnected) {
      try {
        allTemplates = await db.select().from(messageTemplates);
      } catch {
        allTemplates = localStore.templates;
      }
    } else {
      allTemplates = localStore.templates;
    }

    const templateMap = new Map<number, string>();
    allTemplates.forEach((t) => templateMap.set(t.id, t.name));

    const results: BirthdayWishContactSummary[] = [];

    for (const c of allContacts) {
      if (!c.dob) continue;

      const bday = this.calculateNextBirthday(c.dob, settings.defaultSendTime);

      // Find automation for this contact and target year
      const targetYearStr = String(bday.targetYear);
      const matchedAutomation = allAutomations.find((a) => {
        if (a.contactId !== c.id) return false;
        const vars = a.variables as any;
        return vars && vars._isBirthday === 'true' && vars._birthdayYear === targetYearStr;
      });

      // Find if sent in current year
      const currentYearStr = String(new Date().getFullYear());
      const currentYearCompleted = allAutomations.find((a) => {
        if (a.contactId !== c.id) return false;
        const vars = a.variables as any;
        return (
          vars &&
          vars._isBirthday === 'true' &&
          vars._birthdayYear === currentYearStr &&
          (a.status === 'ACCEPTED' || a.status === 'READ' || a.status === 'SENT' || a.status === 'DELIVERED' || a.status === 'SIMULATED')
        );
      });

      let automationStatus: any = 'NOT_SCHEDULED';
      if (c.birthdayAutomationEnabled === false || !settings.enabled) {
        automationStatus = 'PAUSED';
      } else if (matchedAutomation) {
        automationStatus = matchedAutomation.status;
      }

      const templateId = matchedAutomation?.templateId || settings.defaultTemplateId || 1;
      const templateName = templateMap.get(templateId) || 'Birthday';
      const customMsg = matchedAutomation?.variables?._customMessage || settings.customMessage;

      results.push({
        contactId: c.id,
        contactName: c.name,
        contactPhone: c.phone,
        optIn: c.optIn,
        dob: c.dob,
        birthMonth: bday.birthMonth,
        birthDay: bday.birthDay,
        ageTurning: bday.ageTurning,
        daysUntilBirthday: bday.daysUntilBirthday,
        isToday: bday.isToday,
        isThisMonth: bday.isThisMonth,
        nextBirthdayDate: bday.formattedNextDate,
        nextScheduledTime: matchedAutomation ? new Date(matchedAutomation.scheduledAt).toISOString() : bday.targetDate.toISOString(),
        automationId: matchedAutomation?.id || null,
        automationStatus,
        lastSentYear: currentYearCompleted ? new Date().getFullYear() : null,
        birthdayAutomationEnabled: c.birthdayAutomationEnabled !== false,
        templateId,
        templateName,
        customMessage: customMsg,
      });
    }

    // Sort by daysUntilBirthday ascending (today first, then upcoming)
    results.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);

    return results;
  }

  /**
   * Toggles birthday automation for an individual contact
   */
  static async toggleContactBirthdayAutomation(
    contactId: number,
    enabled: boolean
  ): Promise<boolean> {
    if (isDatabaseConnected) {
      try {
        await db
          .update(contacts)
          .set({ birthdayAutomationEnabled: enabled, updatedAt: new Date() })
          .where(eq(contacts.id, contactId));
      } catch {}
    }

    const localC = localStore.contacts.find((c) => c.id === contactId);
    if (localC) {
      localC.birthdayAutomationEnabled = enabled;
      localC.updatedAt = new Date();
    }

    if (enabled) {
      await this.syncContactBirthdayAutomation(contactId);
    }

    return true;
  }

  /**
   * Sends an immediate birthday wish to a contact using the official WhatsApp API
   */
  static async sendBirthdayWishNow(
    contactId: number,
    customMessage?: string
  ): Promise<{ success: boolean; messageId?: string; status?: string; error?: string }> {
    let contact: any = null;
    if (isDatabaseConnected) {
      try { contact = (await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1))[0]; } catch {}
    }
    if (!contact) contact = localStore.contacts.find((c) => c.id === contactId);
    if (!contact) return { success: false, error: 'Contact not found' };

    // Enforce the business owner's active package and real-time message quota
    // before an immediate birthday wish reaches the WhatsApp Cloud API.
    // This closes the send-now path so it cannot bypass billing limits.
    if (isDatabaseConnected && contact.ownerUserId) {
      await assertMessageCapacity(Number(contact.ownerUserId), 1, { reserveScheduled: false });
    }

    const creds = await resolveWhatsAppCredentials(contact.ownerUserId || 0);
    if (!creds.isFullyConfigured || !creds.phoneNumberId || !creds.accessToken) {
      return { success: false, error: 'WhatsApp API credentials are not configured. Connect this business WhatsApp account first.' };
    }

    // Birthday sends must use the business owner's real APPROVED Birthday template.
    // Never silently substitute hello_world: that changes the message the user selected.
    let birthdayTemplate:any = null;
    if (isDatabaseConnected) {
      try {
        const approved = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, contact.ownerUserId), eq(messageTemplates.status, 'APPROVED')));
        birthdayTemplate = approved.find((t:any) => String(t.name || '').toLowerCase().includes('birthday')) || null;
      } catch {}
    }
    if (!birthdayTemplate) {
      return { success: false, error: 'No approved Birthday template is available for this WhatsApp Business account. Sync templates from Meta and approve the Birthday template first.' };
    }

    const settings = this.getSettings();
    const textToSend = customMessage || settings.customMessage.replace(/{{name}}/g, contact.name).replace(/{{age}}/g, '');
    const variables:Record<string,string> = {};
    if ((birthdayTemplate.variableCount || 0) > 0) variables['1'] = contact.name;

    const sendResult = await WhatsAppService.sendTemplateMessage({
      phoneNumberId: creds.phoneNumberId,
      accessToken: creds.accessToken,
      apiVersion: creds.apiVersion || 'v21.0',
      recipientPhone: contact.phone,
      templateName: birthdayTemplate.name,
      templateLanguage: birthdayTemplate.language,
      variables,
      templateComponents: Array.isArray(birthdayTemplate.components) ? birthdayTemplate.components : [],
      fallbackToHelloWorldIfNotFound: false,
    });

    const now = new Date();
    if (sendResult.success) {
      await this.handleBirthdayAutomationCompleted({
        automationId: 0,
        contactId: contact.id,
        completedYear: now.getFullYear(),
        status: 'ACCEPTED',
        templateName: birthdayTemplate.name,
        messageText: textToSend,
      });
      return { success: true, messageId: sendResult.whatsappMessageId, status: 'ACCEPTED' };
    }
    return { success: false, error: sendResult.error };
  }

  /**
   * Edits a scheduled birthday wish before sending
   */
  static async updateScheduledWish(params: {
    automationId: number;
    scheduledAt?: string;
    templateId?: number;
    customMessage?: string;
  }): Promise<{ success: boolean; message?: string }> {
    const { automationId, scheduledAt, templateId, customMessage } = params;

    let targetAuto: any = null;
    if (isDatabaseConnected) {
      try {
        const rows = await db.select().from(automations).where(eq(automations.id, automationId)).limit(1);
        targetAuto = rows[0];
      } catch {}
    }
    if (!targetAuto) {
      targetAuto = localStore.automations.find((a) => a.id === automationId);
    }

    if (!targetAuto) {
      return { success: false, message: 'Automation not found' };
    }

    const updatedVars = { ...(targetAuto.variables || {}) };
    if (customMessage) {
      updatedVars._customMessage = customMessage;
    }

    const updatePayload: any = {
      variables: updatedVars,
      updatedAt: new Date(),
    };

    if (scheduledAt) {
      updatePayload.scheduledAt = new Date(scheduledAt);
    }
    if (templateId) {
      updatePayload.templateId = Number(templateId);
    }

    if (isDatabaseConnected) {
      try {
        await db.update(automations).set(updatePayload).where(eq(automations.id, automationId));
      } catch {}
    }

    const localA = localStore.automations.find((a) => a.id === automationId);
    if (localA) {
      if (updatePayload.scheduledAt) localA.scheduledAt = updatePayload.scheduledAt;
      if (updatePayload.templateId) localA.templateId = updatePayload.templateId;
      localA.variables = updatedVars;
      localA.updatedAt = new Date();
    }

    return { success: true, message: 'Birthday wish updated successfully' };
  }

  /**
   * Returns wish history
   */
  static getWishHistory(): BirthdayWishHistoryItem[] {
    return localStore.birthdayWishHistory;
  }
}
