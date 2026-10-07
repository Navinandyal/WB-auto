import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeMediaFile, validateMediaFile, validateVideoStreams } from '../src/server/media-validation.ts';
test('media decoding rejects corrupt base64 and renamed/truncated/password PDFs',async()=>{
  assert.throws(()=>decodeMediaFile('not base64!'));
  const parts=['%PDF-1.4\n'];
  const offsets=[0];
  for(const object of ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>']) {
    offsets.push(Buffer.byteLength(parts.join('')));parts.push(`${offsets.length-1} 0 obj\n${object}\nendobj\n`);
  }
  const xref=Buffer.byteLength(parts.join(''));
  parts.push('xref\n0 4\n0000000000 65535 f \n'+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const valid=Buffer.from(parts.join(''));
  assert.deepEqual(decodeMediaFile(valid.toString('base64')),valid);
  await validateMediaFile(valid,'application/pdf');
  await assert.rejects(()=>validateMediaFile(Buffer.from('%PDF-1.7\ngarbage\n%%EOF'),'application/pdf'),/damaged/);
  await assert.rejects(()=>validateMediaFile(Buffer.from('a renamed Word document'),'application/pdf'),/complete PDF/);
  await assert.rejects(()=>validateMediaFile(Buffer.from('%PDF-1.7\ntruncated'),'application/pdf'),/complete PDF/);
  await assert.rejects(()=>validateMediaFile(Buffer.from('%PDF-1.7\n/Encrypt 1 0 R\n%%EOF'),'application/pdf'),/unlocked/);
});
test('video checks reject HEVC, unsupported audio and extra streams',()=>{
  validateVideoStreams([{codec_type:'video',codec_name:'h264'},{codec_type:'audio',codec_name:'aac'}]);
  validateVideoStreams([{codec_type:'video',codec_name:'h264'}]);
  assert.throws(()=>validateVideoStreams([{codec_type:'video',codec_name:'hevc'}]),/H.264/);
  assert.throws(()=>validateVideoStreams([{codec_type:'video',codec_name:'h264'},{codec_type:'audio',codec_name:'mp3'}]),/AAC/);
  assert.throws(()=>validateVideoStreams([{codec_type:'video',codec_name:'h264'},{codec_type:'video',codec_name:'h264'}]));
});
test('actual compatible and incompatible MP4 files pass through ffprobe validation',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'greetsync-media-test-'));
  try {
    const valid=join(folder,'valid.mp4'), invalid=join(folder,'invalid.mp4');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=green:s=64x64:r=10','-t','0.3','-c:v','libx264','-pix_fmt','yuv420p',valid]);
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=green:s=64x64:r=10','-t','0.3','-c:v','mpeg4',invalid]);
    await validateMediaFile(await readFile(valid),'video/mp4');
    await assert.rejects(async()=>validateMediaFile(await readFile(invalid),'video/mp4'),/H.264/);
    await assert.rejects(()=>validateMediaFile(Buffer.from('broken video'),'video/mp4'),/damaged/);
  }finally{await rm(folder,{recursive:true,force:true});}
});
