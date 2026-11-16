import {getTableColumns,sql} from 'drizzle-orm';
import {users,contacts,messageTemplates} from '../db/schema.ts';
// These endpoints need identity/status, never profile photos or template media.
export const accountStatusSelect={id:users.id,approvalStatus:users.approvalStatus,isActive:users.isActive};
export const approvedTemplateIdentity={metaTemplateId:messageTemplates.metaTemplateId};

export const sendingContactSelect={...getTableColumns(contacts),avatarData:sql<string|null>`NULL`};
export const sendingBusinessSelect={...getTableColumns(users),businessLogoData:sql<string|null>`NULL`};
