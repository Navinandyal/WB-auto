import type {RequestHandler} from 'express';
/** Token-authenticated API: permit exact configured web origins and Flutter's
 * loopback development server. Never reflect arbitrary sites or enable cookies. */
export function createApiCors(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const configured = new Set<string>();
  for (const raw of [env.PUBLIC_BASE_URL,env.APP_URL,env.META_PUBLIC_BASE_URL,...String(env.CORS_ALLOWED_ORIGINS||'').split(',')]) {
    if (!raw?.trim()) continue;
    try {const u=new URL(raw.trim());if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)configured.add(u.origin);} catch {}
  }
  return (req,res,next)=>{
    res.vary('Origin');
    const origin=req.headers.origin;
    if(!origin)return next(); // native Android, server calls and command-line tools
    let allowed=configured.has(origin);
    try {
      const u=new URL(origin);
      const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
      allowed ||= env.ALLOW_LOCAL_WEB !== 'false' && loopback && ['http:','https:'].includes(u.protocol) && u.origin===origin;
    }catch{}
    if(!allowed)return res.status(403).json({code:'WEB_ORIGIN_NOT_ALLOWED',error:'This web address is not enabled for GreetSync. Ask the administrator to configure CORS_ALLOWED_ORIGINS.'});
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Expose-Headers','X-GreetSync-Request-ID');
    if(req.method!=='OPTIONS')return next();
    res.vary('Access-Control-Request-Method');res.vary('Access-Control-Request-Headers');
    const methods=['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'];
    const headers=['authorization','content-type','accept'];
    const requested=String(req.headers['access-control-request-headers']||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!methods.includes(String(req.headers['access-control-request-method']||'GET').toUpperCase())||requested.some(x=>!headers.includes(x)))
      return res.status(403).json({code:'WEB_PREFLIGHT_NOT_ALLOWED',error:'Unsupported web request.'});
    res.setHeader('Access-Control-Allow-Methods',methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age','600');
    return res.status(204).end();
  };
}
