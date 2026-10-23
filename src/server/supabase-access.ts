import {applicationTables} from './application-tables.ts';
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** The mobile app keeps its current API/login. Its tables are not exposed through
 * Supabase's public Data API. The backend connects as their owning DB role. */
export async function protectSupabaseTables(client:{query:(sql:string,values?:any[])=>Promise<any>}) {
  for(const table of [...applicationTables,'greetsync_deployment_migrations']) {
    await client.query(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY`);
    for(const role of ['anon','authenticated']) {
      const exists=await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
      if(exists.rows.length)await client.query(`REVOKE ALL ON TABLE public.${quote(table)} FROM ${quote(role)}`);
    }
  }
}
