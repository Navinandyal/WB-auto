/** Callers must authenticate admins before using the admin scope. */
export async function savedMediaPreview(id: string, scope: {ownerUserId: number} | {admin: true}, client: {query: Function}) {
 const owner='ownerUserId' in scope ? scope.ownerUserId : null;
 const result=await client.query('SELECT mime_type,file_name,data_base64 FROM message_media WHERE media_id=$1 AND ($2::int IS NULL OR owner_user_id=$2)',[id,owner]);
 const row=result.rows[0];
 return row?{mimeType:row.mime_type,fileName:row.file_name,dataBase64:row.data_base64}:null;
}
