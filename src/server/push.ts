import { createSign } from 'node:crypto';
import { pool } from '../db/index.ts';
let cachedToken: {value:string;until:number}|null=null;
/** Uses explicit service-account credentials; never probes instance metadata. */
async function accessToken(credentials:any):Promise<string> {
  if(cachedToken && cachedToken.until>Date.now())return cachedToken.value;
  const now=Math.floor(Date.now()/1000);
  const encode=(value:any)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const assertion=`${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok||!data.access_token)throw new Error('Firebase service-account token exchange failed.');
  cachedToken={value:data.access_token,until:Date.now()+Math.max(60,Number(data.expires_in||3600)-60)*1000};return cachedToken.value;
}
export async function sendAccountPush(userId:number,input:{title:string;message:string;id:number}):Promise<void>{
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)return;
  try {
    const creds=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(!creds.project_id||!creds.client_email||!creds.private_key)throw new Error('Firebase configuration is incomplete.');
    const rows=await pool.query('SELECT token FROM push_devices WHERE user_id=$1',[userId]);
    if(!rows.rows.length)return;
    const token=await accessToken(creds);
    await Promise.allSettled(rows.rows.map(async row=>{
      const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(creds.project_id)}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({message:{token:row.token,notification:{title:input.title,body:input.message},data:{notificationId:String(input.id)},android:{priority:'high',notification:{channel_id:'greetsync_messages',tag:`greetsync_${input.id}`}}}})});
      if(!response.ok){const data=await response.json();if(data.error?.details?.some((d:any)=>d.errorCode==='UNREGISTERED'))await pool.query('DELETE FROM push_devices WHERE token=$1',[row.token]);else console.warn('[Push] FCM request failed:',response.status);}
    }));
  }catch(err:any){console.warn('[Push] Unable to deliver account update:',err.message);}
}
