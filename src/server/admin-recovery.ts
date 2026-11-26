import {randomBytes} from 'node:crypto';
import {hashPassword,verifyPassword,normalizeLoginPhone} from '../lib/password-auth.ts';
export function createAdminRecovery(store:any){
 return {
  request:async(_req:any,res:any)=>res.json({success:true,adminAssisted:true,message:'Contact your administrator. After verifying your identity, they will give you a temporary password valid for one use.'}),
  issue:async(req:any,res:any)=>{
   res.setHeader('Cache-Control','no-store');
   if(req.user?.role!=='admin')return res.status(403).json({error:'Administrator access required.'});
   if(req.body?.identityVerified!==true)return res.status(400).json({error:'Verify the business owner’s identity before issuing a temporary password.'});
   const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid business.'});
   const c=await store.connect();try{
    await c.query('BEGIN');
    const result=await c.query("SELECT id,role,is_active FROM users WHERE id=$1 FOR UPDATE",[id]);const user=result.rows[0];
    if(!user||user.role==='admin'||!user.is_active){await c.query('ROLLBACK');return res.status(400).json({error:'An active business account is required.'});}
    const password=randomBytes(12).toString('base64url'),resetId='admin:'+randomBytes(24).toString('hex');
    await c.query('UPDATE password_reset_requests SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[id]);
    await c.query("INSERT INTO password_reset_requests(reset_id,user_id,code_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '20 minutes')",[resetId,id,hashPassword(password)]);
    await c.query("INSERT INTO audit_logs(action,actor,details) VALUES('ADMIN_RECOVERY_ISSUED',$1,$2::jsonb)",[String(req.user.id),JSON.stringify({userId:id,identityVerified:true})]);
    await c.query('COMMIT');res.json({success:true,temporaryPassword:password,expiresInSeconds:1200,message:'Share privately with the verified owner. Valid once for 20 minutes on Forgot Password.'});
   }catch{await c.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Could not issue recovery password.'});}finally{c.release();}
  },
  redeem:async(req:any,res:any)=>{
   res.setHeader('Cache-Control','no-store');
   const phone=normalizeLoginPhone(req.body?.mobile||''),temporary=String(req.body?.temporaryPassword||''),password=String(req.body?.newPassword||'');
   if(!phone||!temporary||password.length<8||password.length>256||password===temporary)return res.status(400).json({error:'Enter your mobile number, temporary password and a different new password of 8–256 characters.'});
   const c=await store.connect();try{
    await c.query('BEGIN');
    const users=await c.query('SELECT id,is_active FROM users WHERE phone=$1 FOR UPDATE',[phone]);const user=users.rows[0];
    const result=user?await c.query("SELECT *,expires_at>NOW() AS valid_time FROM password_reset_requests WHERE user_id=$1 AND used_at IS NULL AND reset_id LIKE 'admin:%' ORDER BY id DESC LIMIT 1 FOR UPDATE",[user.id]):{rows:[]};const r=result.rows[0];
    if(!user?.is_active||!r||!r.valid_time||r.attempts>=5){await c.query('ROLLBACK');return res.status(400).json({error:'Temporary password is invalid, expired or already used. Contact your administrator.'});}
    if(!verifyPassword(temporary,r.code_hash)){await c.query('UPDATE password_reset_requests SET attempts=attempts+1 WHERE id=$1',[r.id]);await c.query('COMMIT');return res.status(400).json({error:'Temporary password is invalid or expired.'});}
    await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hashPassword(password),user.id]);
    await c.query('UPDATE password_reset_requests SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
    await c.query('UPDATE refresh_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
    await c.query('UPDATE biometric_credentials SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
    await c.query("INSERT INTO audit_logs(action,actor,details) VALUES('ADMIN_RECOVERY_COMPLETED',$1,$2::jsonb)",[String(user.id),JSON.stringify({userId:user.id})]);
    await c.query('COMMIT');res.json({success:true,message:'Password changed. Sign in with your new password.'});
   }catch{await c.query('ROLLBACK').catch(()=>{});res.status(503).json({error:'Recovery could not finish. Please try again.'});}finally{c.release();}
  }
 };
}
