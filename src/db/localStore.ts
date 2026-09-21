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
  public templates: LocalTemplate[] = [
    {
      id: 1,
      metaTemplateId: 'meta_tpl_hello_world',
      name: 'hello_world',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        {
          type: 'BODY',
          text: 'Hello World! Welcome and thank you for connecting with us.',
        },
      ],
      variableCount: 0,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      metaTemplateId: 'meta_tpl_appointment_confirmation',
      name: 'appointment_confirmation',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        {
          type: 'BODY',
          text: 'Hello {{1}}, your appointment {{2}} has been confirmed for {{3}}. Reply STOP to unsubscribe.',
        },
      ],
      variableCount: 3,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      metaTemplateId: 'meta_tpl_payment_reminder',
      name: 'payment_reminder',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        {
          type: 'BODY',
          text: 'Dear {{1}}, this is a reminder that invoice {{2}} is due on {{3}}. Thank you!',
        },
      ],
      variableCount: 3,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 4,
      metaTemplateId: 'meta_tpl_welcome_message',
      name: 'welcome_greeting',
      language: 'en_US',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [
        {
          type: 'BODY',
          text: 'Welcome {{1}}! We are thrilled to have you with us. Let us know if you need any assistance.',
        },
      ],
      variableCount: 1,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 5,
      metaTemplateId: 'meta_tpl_happy_birthday_wishes',
      name: 'happy_birthday_wishes',
      language: 'en_US',
      category: 'MARKETING',
      status: 'PENDING_APPROVAL',
      components: [
        {
          type: 'BODY',
          text: 'Happy Birthday {{1}}! 🎂🎉 Wishing you a wonderful celebration and a fantastic year ahead filled with happiness, health, and success! Warmest regards from our team.',
        },
        {
          type: 'FOOTER',
          text: 'Reply STOP to opt out',
        },
      ],
      variableCount: 1,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  public automations: LocalAutomation[] = [];
  public messages: any[] = [];
  public auditLogs: any[] = [];
  public simulationMode = false;
  public nextContactId = 1;
  public nextTemplateId = 6;
  public nextAutomationId = 1;
  public nextMessageId = 1;

  public birthdaySettings = {
    enabled: true,
    defaultSendTime: '09:00',
    defaultTemplateId: 1, // hello_world - Meta's universal default pre-approved template
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
