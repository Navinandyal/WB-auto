import {initDatabaseSchema,pool} from './index.ts';
// Schema only: never seed a new admin before restoring the original users/IDs.
async function prepare(){
 if(process.env.DATABASE_PROVIDER!=='supabase')throw new Error('DATABASE_PROVIDER=supabase is required for this preparation step.');
 if(!await initDatabaseSchema())throw new Error('Could not prepare the Supabase schema. No backup was restored.');
 console.log('[OK] Supabase schema prepared without replacing or seeding business data.');
}
prepare().catch(e=>{console.error('[ERROR]',e.message);process.exitCode=1;}).finally(()=>pool.end());
