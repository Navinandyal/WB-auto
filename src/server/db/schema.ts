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
  businessLogoData: text('business_logo_data'),
  approvedAt: timestamp('approved_at'),
  approvedById: integer('approved_by_id'),
  lastLoginAt: timestamp('last_login_at'),
  deletionRequestedAt: timestamp('deletion_requested_at'),
  purgeAfter: timestamp('purge_after'),
  termsAcceptedAt: timestamp('terms_accepted_at'),
  privacyAcceptedAt: timestamp('privacy_accepted_at'),
  legalVersion: text('legal_version'),
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

// Persistent refresh sessions. Raw refresh tokens are never stored; only SHA-256 hashes.
export const refreshSessions = pgTable('refresh_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
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
  businessPhone: text('business_phone'),
  displayPhoneNumber: text('display_phone_number'),
  verifiedName: text('verified_name'),
  qualityRating: text('quality_rating'),
  connectionStatus: text('connection_status').default('SAVED').notNull(), // SAVED, CONNECTED, CONNECTION_ERROR
  lastConnectionError: text('last_connection_error'),
  metaBusinessId: text('meta_business_id'),
  status: text('status').default('DISCONNECTED'), // legacy compatibility
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
  email: text('email'),
  notes: text('notes'),
  avatarData: text('avatar_data'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});


// Business-owned contact groups for bulk messaging and automations.
export const contactGroups = pgTable('contact_groups', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const contactGroupMembers = pgTable('contact_group_members', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => contactGroups.id, { onDelete: 'cascade' }).notNull(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Approved WhatsApp Templates
export const messageTemplates = pgTable('message_templates', {
  id: serial('id').primaryKey(),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  metaTemplateId: text('meta_template_id').unique(),
  name: text('name').notNull(),
  displayName: text('display_name'),
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

// In-app notifications for administrators and individual business users.
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  targetRole: text('target_role').default('BUSINESS').notNull(), // ADMIN or BUSINESS
  type: text('type').default('SYSTEM').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Admin-managed subscription packages. BASE packages unlock the application; MESSAGE_ADDON packages add message quota.
export const subscriptionPackages = pgTable('subscription_packages', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  packageType: text('package_type').default('BASE').notNull(), // BASE, MESSAGE_ADDON
  benefits: jsonb('benefits').$type<string[]>().default([]).notNull(),
  messageLimit: integer('message_limit').default(0).notNull(),
  contactLimit: integer('contact_limit').default(0).notNull(),
  automationLimit: integer('automation_limit').default(0).notNull(),
  pricePaise: integer('price_paise').default(0).notNull(),
  durationMonths: integer('duration_months').default(1).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// One row represents either a requested or active purchase of an admin-defined package.
export const userSubscriptions = pgTable('user_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  packageId: integer('package_id').references(() => subscriptionPackages.id, { onDelete: 'restrict' }).notNull(),
  status: text('status').default('PENDING').notNull(), // PENDING, ACTIVE, EXPIRED, CANCELLED, REJECTED
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  approvedById: integer('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
  pricePaiseSnapshot: integer('price_paise_snapshot').default(0).notNull(),
  messageLimitSnapshot: integer('message_limit_snapshot').default(0).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});



// Admin-created reusable festival/campaign template suggestions.
// Business users can copy a suggestion, edit it, and submit their own copy to Meta for approval.
export const templateSuggestions = pgTable('template_suggestions', {
  id: serial('id').primaryKey(),
  createdById: integer('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  festival: text('festival'),
  description: text('description'),
  templateName: text('template_name').notNull(),
  language: text('language').default('en_US').notNull(),
  category: text('category').default('MARKETING').notNull(),
  header: text('header'),
  body: text('body').notNull(),
  footer: text('footer'),
  buttons: jsonb('buttons').$type<any[]>().default([]).notNull(),
  activeFrom: timestamp('active_from'),
  activeUntil: timestamp('active_until'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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
