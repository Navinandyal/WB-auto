import {randomBytes,randomInt} from 'node:crypto';
import {hashPassword,verifyPassword,normalizeLoginPhone} from '../lib/password-auth.ts';

type Store={query:(...args:any[])=>Promise<any>;connect:()=>Promise<any>};
export function resetDeliveryConfiguration(env=process.env){
  if(!env.RESEND_API_KEY || !env.PASSWORD_RESET_FROM)throw new Error('Password reset email is not configured. Contact your administrator.');
  return {key:env.RESEND_API_KEY,from:env.PASSWORD_RESET_FROM};
}
export async function deliverResetCode(email:string,code:string,resetId:string,env=process.env,transport:typeof fetch=fetch){
  const config=resetDeliveryConfiguration(env);
  const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json','Idempotency-Key':`greetsync-reset-${resetId}`},body:JSON.stringify({from:config.from,to:[email],subject:'GreetSync password reset code',text:`Your GreetSync verification code is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Reset email could not be accepted. Contact your administrator or try again later.');
  const result=await response.json();if(!result?.id)throw new Error('Reset email acceptance was not confirmed.');
}
export function createPasswordResetHandlers(store:Store,{deliver=deliverResetCode,configured=resetDeliveryConfiguration}:any={}){
  return {
    request:async(req:any,res:any)=>{
      let resetId:string|undefined;
      try{
        const identifier=String(req.body?.identifier||req.body?.mobile||req.body?.phone||'').trim();
        const phone=normalizeLoginPhone(identifier);
        if(!identifier || (!identifier.includes('@')&&!phone))return res.status(400).json({error:'Enter your registered mobile number or email.'});
        const result=identifier.includes('@')?await store.query('SELECT id,email,is_active FROM users WHERE lower(email)=lower($1) LIMIT 1',[identifier]):await store.query('SELECT id,email,is_active FROM users WHERE phone=$1 LIMIT 1',[phone]);
        const account=result.rows[0];
        if(!account)return res.status(404).json({error:'No account was found for those details.'});
        if(!account.is_active)return res.status(403).json({error:'This account is disabled. Contact the administrator.'});
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account.email||''))return res.status(409).json({code:'RESET_EMAIL_MISSING',error:'This account has no registered recovery email. Contact your administrator.'});
        try{configured();}catch{return res.status(503).json({code:'RESET_DELIVERY_NOT_CONFIGURED',error:'Password reset email is not configured. Contact your administrator.'});}
        const code=String(randomInt(100000,1000000));resetId=randomBytes(24).toString('hex');
        const c=await store.connect();
        try{
          await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(31854,$1)',[account.id]);
          const recent=await c.query("SELECT count(*)::int AS count FROM password_reset_requests WHERE user_id=$1 AND created_at>NOW()-INTERVAL '15 minutes'",[account.id]);
          if(Number(recent.rows[0].count)>=3){await c.query('ROLLBACK');return res.status(429).json({error:'Too many reset requests. Try again in 15 minutes.'});}
          await c.query('UPDATE password_reset_requests SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[account.id]);
          await c.query("INSERT INTO password_reset_requests(reset_id,user_id,code_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '15 minutes')",[resetId,account.id,hashPassword(code)]);
          await c.query('COMMIT');
        }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
        try{await deliver(account.email,code,resetId);}catch{
          await store.query('UPDATE password_reset_requests SET used_at=NOW() WHERE reset_id=$1',[resetId]);
          return res.status(503).json({code:'RESET_DELIVERY_FAILED',error:'The reset email could not be sent. Try again later or contact your administrator.'});
        }
        return res.json({success:true,resetId,expiresInSeconds:900,message:'Reset code sent to your registered email. Check your inbox and spam folder.'});
      }catch{return res.status(503).json({code:'RESET_SERVICE_UNAVAILABLE',error:'Password reset is temporarily unavailable. Please try again shortly.'});}
    },
    reset:async(req:any,res:any)=>{
      const resetId=String(req.body?.resetId||'').trim(),code=String(req.body?.code||req.body?.otp||'').trim(),password=String(req.body?.newPassword||'');
      if(!/^[a-f0-9]{48}$/.test(resetId)||!/^\d{6}$/.test(code))return res.status(400).json({error:'Enter the valid reset request and six-digit code.'});
      if(password.length<8||password.length>256)return res.status(400).json({error:'Password must be between 8 and 256 characters.'});
      let c:any;
      try{
        c=await store.connect();await c.query('BEGIN');
        const result=await c.query('SELECT *,expires_at>NOW() AS valid_time FROM password_reset_requests WHERE reset_id=$1 FOR UPDATE',[resetId]);const r=result.rows[0];
        if(!r||r.used_at||!r.valid_time||r.attempts>=5){await c.query('ROLLBACK');return res.status(400).json({error:'The code is invalid, expired or already used. Request a new code.'});}
        if(!verifyPassword(code,r.code_hash)){await c.query('UPDATE password_reset_requests SET attempts=attempts+1 WHERE id=$1',[r.id]);await c.query('COMMIT');return res.status(400).json({error:'The code is invalid or has expired.'});}
        await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hashPassword(password),r.user_id]);
        await c.query('UPDATE password_reset_requests SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL',[r.user_id]);
        await c.query('UPDATE refresh_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[r.user_id]);
        await c.query('UPDATE biometric_credentials SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[r.user_id]);
        await c.query("INSERT INTO audit_logs(action,actor,details) VALUES('PASSWORD_RESET_COMPLETED',$1,$2::jsonb)",[`user:${r.user_id}`,JSON.stringify({userId:r.user_id})]);
        await c.query('COMMIT');return res.json({success:true,message:'Password reset successfully. Sign in with your new password.'});
      }catch{if(c)await c.query('ROLLBACK').catch(()=>{});return res.status(503).json({code:'RESET_SERVICE_UNAVAILABLE',error:'Password reset could not finish. Please try again shortly.'});}
      finally{c?.release();}
    }
  };
}
