/**
 * In-memory fallback store for local development.
 * Automatically used when PostgreSQL is offline or credentials are not yet configured.
 */

export interface LocalContact {
  id: number;
  name: string;
  phone: string;
  optIn: boolean;
  dob?: string | null; // YYYY-MM-DD
  birthdayAutomationEnabled?: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalTemplate {
  id: number;
  metaTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: any;
  variableCount: number;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalAutomation {
  id: number;
  contactId: number;
  templateId: number;
  variables: Record<string, string>;
  scheduledAt: Date;
  timezone: string;
  status: string;
  lockedAt?: Date | null;
  executedAt?: Date | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalWhatsAppAccount {
  id: number;
  metaAppId: string;
  metaAppSecret: string;
  businessAccountId: string;
  phoneNumberId: string;
  accessToken: string;
  webhookVerifyToken: string;
  apiVersion: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  status: string;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

class LocalStore {
  public account: LocalWhatsAppAccount | null = null;
  public contacts: LocalContact[] = [];
  // No demo templates are kept in the local fallback store. Real templates are
  // loaded from PostgreSQL/Meta. The approved Birthday reference is inserted by
  // server startup into PostgreSQL based on the user-supplied approved template.
  public templates: LocalTemplate[] = [];
  public automations: LocalAutomation[] = [];
  public messages: any[] = [];
  public auditLogs: any[] = [];
  public simulationMode = false;
  public nextContactId = 1;
  public nextTemplateId = 1;
  public nextAutomationId = 1;
  public nextMessageId = 1;

  public birthdaySettings = {
    enabled: true,
    defaultSendTime: '09:00',
    defaultTemplateId: 0, // resolved dynamically to the approved Birthday template
    customMessage: '🎉 Happy Birthday {{name}}! Wishing you a fantastic year filled with happiness, health, and success! 🎂🎈',
    timezone: 'Asia/Kolkata',
  };

  public birthdayWishHistory: Array<{
    id: number;
    automationId?: number | null;
    contactId: number;
    contactName: string;
    contactPhone: string;
    year: number;
    scheduledAt: string;
    executedAt?: string;
    status: string;
    templateName?: string;
    messagePreview?: string;
    errorMessage?: string;
  }> = [];
}

export const localStore = new LocalStore();
