export interface User {
  id: number;
  uid: string;
  email: string;
  name?: string;
  role: string;
}

export interface WhatsAppAccountSettings {
  configured: boolean;
  hasToken?: boolean;
  hasPhoneId?: boolean;
  tokenSource?: string;
  phoneIdSource?: string;
  errorNotes?: string;
  id?: number;
  metaAppId: string;
  metaAppSecretMasked?: string;
  businessAccountId: string;
  phoneNumberId: string;
  accessTokenMasked?: string;
  webhookVerifyToken: string;
  apiVersion: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  lastTestedAt?: string;
}

export interface Contact {
  id: number;
  name: string;
  phone: string;
  optIn: boolean;
  dob?: string | null; // Format: YYYY-MM-DD
  birthdayAutomationEnabled?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BirthdaySettings {
  enabled: boolean;
  defaultSendTime: string; // e.g. "09:00" in 24h format
  defaultTemplateId: number;
  customMessage: string;
  timezone: string;
}

export interface BirthdayWishContactSummary {
  contactId: number;
  contactName: string;
  contactPhone: string;
  optIn: boolean;
  dob: string;
  birthMonth: number; // 1-12
  birthDay: number; // 1-31
  ageTurning: number;
  daysUntilBirthday: number; // 0 for today
  isToday: boolean;
  isThisMonth: boolean;
  nextBirthdayDate: string; // YYYY-MM-DD
  nextScheduledTime?: string;
  automationId?: number | null;
  automationStatus?: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SIMULATED' | 'NOT_SCHEDULED' | 'PAUSED';
  lastSentYear?: number | null;
  birthdayAutomationEnabled: boolean;
  templateId?: number;
  templateName?: string;
  customMessage?: string;
}

export interface BirthdayWishHistoryItem {
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
}

export interface MessageTemplate {
  id: number;
  metaTemplateId?: string;
  name: string;
  language: string;
  category: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  components: any[];
  variableCount: number;
  lastSyncedAt?: string;
}

export type Template = MessageTemplate;

export interface ScheduledAutomation {
  id: number;
  contactId: number;
  templateId: number;
  variables: Record<string, string>;
  scheduledAt: string;
  timezone: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'CANCELLED' | 'SIMULATED';
  executedAt?: string;
  errorMessage?: string;
  createdAt: string;
  contactName: string;
  contactPhone: string;
  contactOptIn: boolean;
  templateName: string;
  templateLanguage: string;
  templateStatus: string;
}

export interface DashboardData {
  connection: {
    configured: boolean;
    status: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    lastTestedAt?: string;
  };
  stats: {
    totalContacts: number;
    scheduledMessages: number;
    messagesSent: number;
    failedMessages: number;
  };
  upcoming: ScheduledAutomation[];
}
