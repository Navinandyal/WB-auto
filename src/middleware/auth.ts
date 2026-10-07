import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { Request, Response, NextFunction } from 'express';
import { verifySessionToken, SessionUser } from '../lib/password-auth.ts';

export interface AuthUser extends SessionUser {}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const user = verifySessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  try {
    const [account]=await db.select({isActive:users.isActive,status:users.approvalStatus}).from(users).where(eq(users.id,user.id)).limit(1);
    if(!account)return res.status(401).json({error:'Account unavailable.'});
    const readStatus=['/api/account/status','/api/auth/me','/api/notifications'].includes(req.path) && req.method==='GET';
    const unregister=req.path==='/api/push/devices' && req.method==='DELETE';
    if((!account.isActive || !['ACTIVE','APPROVED'].includes(account.status)) && !readStatus && !unregister && user.role!=='admin')return res.status(403).json({code:account.status==='DEACTIVATED'?'ACCOUNT_DEACTIVATED':'ACCOUNT_SUSPENDED',error:account.status==='DEACTIVATED'?'Your account is deactivated. Contact support to reactivate.':'Your account is not active. Contact support.'});
    req.user=user;next();
  }catch{return res.status(503).json({error:'Unable to verify account status. Try again.'});}
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
};
