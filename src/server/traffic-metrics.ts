import type {Request,Response,NextFunction} from 'express';
export function createTrafficMetrics(){
 const since=new Date().toISOString();const rows=new Map<string,{route:string;requests:number;bodyBytes:number;errors:number}>();
 return {
  middleware(req:Request,res:Response,next:NextFunction){
   res.once('finish',()=>{
    // Use registered route patterns only: never record query strings, IDs,
    // recipient numbers, authorization headers or request/response bodies.
    const route=`${req.method} ${req.route?.path||'unmatched'}`;
    const row=rows.get(route)||{route,requests:0,bodyBytes:0,errors:0};
    row.requests++;if(res.statusCode>=400)row.errors++;
    const bytes=Number(res.getHeader('content-length')||0);
    if(req.method!=='HEAD'&&res.statusCode!==304&&Number.isFinite(bytes))row.bodyBytes+=Math.max(0,bytes);
    rows.set(route,row);
   });next();
  },
  snapshot(){return {since,scope:'response body bytes since this process started; excludes TLS/headers, streamed bodies without Content-Length and database traffic',routes:[...rows.values()].sort((a,b)=>b.bodyBytes-a.bodyBytes).slice(0,40)};}
 };
}
