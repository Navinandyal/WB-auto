import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);
const invalid = (message:string) => Object.assign(new Error(message), {statusCode:400});
export function decodeMediaFile(data:string):Buffer {
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) throw invalid('Invalid media data. Select and upload the original file again.');
  const bytes=Buffer.from(data,'base64');
  if(bytes.toString('base64')!==data) throw invalid('Invalid media data. Select the original file again.');
  return bytes;
}
export function validateVideoStreams(streams:any[]):void {
  const video=streams.filter(s=>s.codec_type==='video'), audio=streams.filter(s=>s.codec_type==='audio');
  if(video.length!==1 || video[0].codec_name!=='h264' || audio.length>1 || audio.some(s=>s.codec_name!=='aac')) {
    throw invalid('WhatsApp videos must use H.264 video and AAC audio (if present), with one video stream and at most one audio stream. Export as a compatible MP4 and upload again.');
  }
}
export async function validateMediaFile(bytes:Buffer,mime:string):Promise<void> {
  if(mime==='application/pdf') {
    if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(Math.max(0,bytes.length-2048)).includes(Buffer.from('%%EOF'))) throw invalid('This file is not a complete PDF. Export a new PDF and upload it again.');
    if(bytes.includes(Buffer.from('/Encrypt'))) throw invalid('Use an unlocked PDF without password protection.');
    const folder=await mkdtemp(join(tmpdir(),'greetsync-pdf-'));
    try {
      const file=join(folder,'upload.pdf');await writeFile(file,bytes);
      let info:string;
      try {info=(await run(process.env.PDFINFO_PATH||'pdfinfo',[file],{timeout:15000,maxBuffer:1024*1024,env:{...process.env,LC_ALL:'C'}})).stdout;}
      catch(e:any){if(e.code==='ENOENT')throw Object.assign(new Error('PDF checking is unavailable on this server. Install Poppler/pdfinfo before uploading PDFs.'),{statusCode:503});throw invalid('The PDF is damaged, password protected or cannot be read. Export an unlocked PDF and upload again.');}
      if(!/^Pages:\s+[1-9]\d*$/m.test(info)||/^Encrypted:\s+yes/m.test(info))throw invalid('Use a readable PDF with pages and without password protection.');
    } finally {await rm(folder,{recursive:true,force:true});}

  } else if(mime.startsWith('video/')) {
    const folder=await mkdtemp(join(tmpdir(),'greetsync-video-'));
    try {
      const file=join(folder,'upload');await writeFile(file,bytes);
      let output:string;
      try {output=(await run(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{timeout:15000,maxBuffer:1024*1024})).stdout;}
      catch(e:any) {if(e.code==='ENOENT')throw Object.assign(new Error('Video checking is unavailable on this server. Install FFmpeg/ffprobe before uploading videos.'),{statusCode:503});throw invalid('The video is damaged or cannot be read. Export a compatible MP4 and upload again.');}
      const info=JSON.parse(output);
      if(!String(info.format?.format_name||'').split(',').some((x:string)=>['mov','mp4','3gp'].includes(x))) throw invalid('Use an MP4 or 3GP video container.');
      validateVideoStreams(info.streams||[]);
    } finally {await rm(folder,{recursive:true,force:true});}
  } else if(mime==='image/png') {
    if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw invalid('This file is not a PNG image.');
  } else if(mime==='image/jpeg' && !(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)) throw invalid('This file is not a JPEG image.');
}
