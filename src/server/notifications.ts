import { sendAccountPush } from './push.ts';
import { db } from '../db/index.ts';
import { notifications } from '../db/schema.ts';

export type NotificationTarget = {
  userId?: number | null;
  targetRole?: 'ADMIN' | 'BUSINESS';
  type?: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
};

export async function createNotification(input: NotificationTarget): Promise<void> {
  try {
    const [saved] = await db.insert(notifications).values({
      userId: input.userId ?? null,
      targetRole: input.targetRole ?? (input.userId ? 'BUSINESS' : 'ADMIN'),
      type: input.type ?? 'SYSTEM',
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    }).returning();
    if (input.userId) void sendAccountPush(input.userId, {...input,id:saved.id});
  } catch (err: any) {
    console.warn('[Notifications] Unable to save notification:', err?.message || err);
  }
}
