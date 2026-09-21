import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Application users. Admin is seeded from backend environment variables; business users are created by admin.
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  phone: text('phone').unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  role: text('role').default('business_user').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  approvalStatus: text('approval_status').default('PENDING').notNull(), // PENDING, APPROVED, REJECTED
  businessName: text('business_name'),
  businessAddress: text('business_address'),
  approvedAt: timestamp('approved_at'),
  approvedById: integer('approved_by_id'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
});



// Short-lived password reset verification requests.
export const passwordResetRequests = pgTable('password_reset_requests', {
  id: serial('id').primaryKey(),
  resetId: text('reset_id').notNull().unique(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// WhatsApp Account / Settings
export const whatsappAccounts = pgTable('whatsapp_accounts', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  metaAppId: text('meta_app_id').notNull(),
  metaAppSecret: text('meta_app_secret').notNull(),
  businessAccountId: text('business_account_id').notNull(),
  phoneNumberId: text('phone_number_id').notNull(),
  accessToken: text('access_token').notNull(),
  webhookVerifyToken: text('webhook_verify_token').notNull(),
  apiVersion: text('api_version').default('v21.0').notNull(),
  displayPhoneNumber: text('display_phone_number'),
  verifiedName: text('verified_name'),
  qualityRating: text('quality_rating'),
  status: text('status').default('CONNECTED'), // CONNECTED, DISCONNECTED, ERROR
  lastTestedAt: timestamp('last_tested_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Contacts
export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(), // normalized E.164 without spaces e.g. +919876543210
  optIn: boolean('opt_in').default(true).notNull(),
  dob: text('dob'), // YYYY-MM-DD
  birthdayAutomationEnabled: boolean('birthday_automation_enabled').default(true).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Approved WhatsApp Templates
export const messageTemplates = pgTable('message_templates', {
  id: serial('id').primaryKey(),
  metaTemplateId: text('meta_template_id').unique(),
  name: text('name').notNull(),
  language: text('language').notNull(),
  category: text('category').notNull(), // MARKETING, UTILITY, AUTHENTICATION
  status: text('status').notNull(), // APPROVED, REJECTED, PENDING
  components: jsonb('components').notNull(), // header, body, footer, buttons
  variableCount: integer('variable_count').default(0).notNull(),
  lastSyncedAt: timestamp('last_synced_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Automations (Scheduled WhatsApp Message tasks)
export const automations = pgTable('automations', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  templateId: integer('template_id').references(() => messageTemplates.id, { onDelete: 'cascade' }).notNull(),
  variables: jsonb('variables').$type<Record<string, string>>().notNull(), // { "1": "Rahul", "2": "Appointment #123" }
  scheduledAt: timestamp('scheduled_at').notNull(),
  timezone: text('timezone').default('UTC').notNull(),
  status: text('status').default('SCHEDULED').notNull(), // SCHEDULED, PROCESSING, SENT, DELIVERED, READ, FAILED, CANCELLED
  lockedAt: timestamp('locked_at'), // Atomic worker lock
  executedAt: timestamp('executed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Sent WhatsApp Messages record
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  automationId: integer('automation_id').references(() => automations.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  direction: text('direction').default('OUTBOUND').notNull(), // OUTBOUND, INBOUND
  messageType: text('message_type').default('TEMPLATE').notNull(), // TEMPLATE, TEXT
  templateName: text('template_name'),
  templateLanguage: text('template_language'),
  content: text('content'),
  variables: jsonb('variables').$type<Record<string, string>>(),
  whatsappMessageId: text('whatsapp_message_id').unique(), // wamid.HBg...
  status: text('status').default('SENT').notNull(), // SENT, DELIVERED, READ, FAILED
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at').defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  failedAt: timestamp('failed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Automation Executions log
export const automationExecutions = pgTable('automation_executions', {
  id: serial('id').primaryKey(),
  automationId: integer('automation_id').references(() => automations.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').notNull(), // SUCCESS, FAILED
  attemptNumber: integer('attempt_number').default(1).notNull(),
  requestPayload: jsonb('request_payload'),
  responsePayload: jsonb('response_payload'),
  errorMessage: text('error_message'),
  executedAt: timestamp('executed_at').defaultNow(),
});

// Audit Log
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(), // SETTINGS_UPDATE, AUTOMATION_SCHEDULED, AUTOMATION_CANCELLED, etc.
  actor: text('actor').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const contactsRelations = relations(contacts, ({ many }) => ({
  automations: many(automations),
  messages: many(messages),
}));

export const automationsRelations = relations(automations, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [automations.contactId],
    references: [contacts.id],
  }),
  template: one(messageTemplates, {
    fields: [automations.templateId],
    references: [messageTemplates.id],
  }),
  messages: many(messages),
  executions: many(automationExecutions),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  contact: one(contacts, {
    fields: [messages.contactId],
    references: [contacts.id],
  }),
  automation: one(automations, {
    fields: [messages.automationId],
    references: [automations.id],
  }),
}));
