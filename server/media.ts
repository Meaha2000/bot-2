import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function convertToMp3(inputPath: string): Promise<string> {
  const outputPath = path.join(UPLOADS_DIR, `${uuidv4()}.mp3`);
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('mp3')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

export async function processMedia(buffer: Buffer, mimeType: string): Promise<{ data: string; mimeType: string }> {
  // If it's a voice note (ogg/webm), convert to mp3 for Gemini compatibility if needed
  // Gemini actually supports ogg, but the user specifically asked for conversion logic example
  if (mimeType.includes('ogg') || mimeType.includes('webm')) {
    const tempInput = path.join(UPLOADS_DIR, `${uuidv4()}.tmp`);
    fs.writeFileSync(tempInput, buffer);
    
    try {
      const mp3Path = await convertToMp3(tempInput);
      const mp3Buffer = fs.readFileSync(mp3Path);
      
      // Cleanup
      fs.unlinkSync(tempInput);
      fs.unlinkSync(mp3Path);
      
      return {
        data: mp3Buffer.toString('base64'),
        mimeType: 'audio/mp3'
      };
    } catch (err) {
      console.error('Conversion failed, using original:', err);
      return {
        data: buffer.toString('base64'),
        mimeType
      };
    }
  }
  
  return {
    data: buffer.toString('base64'),
    mimeType
  };
}
