import fs from 'fs';
import 'dotenv/config';
import { Storage } from '@google-cloud/storage';
import ytdl from 'ytdl-core';
import speech from '@google-cloud/speech';
import ffmpeg from 'fluent-ffmpeg';

const credentials = JSON.parse(Buffer.from(process.env.SERVICE_ACCOUNT_JSON, 'base64'));

(async () => {
  const bucketName = 'line-tracker-19d25.appspot.com';
  const gcsPath = 'video-to-text/audios/sample.mp3';
  const videoUrl = 'https://www.youtube.com/watch?v=R6ZGGXOFjl4';
  const storage = new Storage({ credentials });

  console.log('uploading...');
  await uploadToGCS({ storage, bucketName, gcsPath, videoUrl });
  console.log('done uploading');

  const speechClient = new speech.SpeechClient({ credentials });
  const request = {
    config: {
      encoding: 'mp3',
      sampleRateHertz: 44100,
      languageCode: 'zh-TW',
      enableAutomaticPunctuation: true,
    },
    audio: {
      uri: `gs://${bucketName}/${gcsPath}`,
    },
  };
  const [operation] = await speechClient.longRunningRecognize(request);
  const [response] = await operation.promise();
  fs.writeFileSync('dist/output.json', JSON.stringify(response));
})();

async function uploadToGCS({ storage, bucketName, gcsPath, videoUrl }) {
  if ((await storage.bucket(bucketName).file(gcsPath).exists())[0]) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const uploadStream = storage.bucket(bucketName).file(gcsPath).createWriteStream();
    const ytVideoStream = ytdl(videoUrl, {
      filter: (format) => format.container === 'mp4' && !format.hasVideo,
    });
    ffmpeg(ytVideoStream)
      .setFfmpegPath(require('ffmpeg-static'))
      .withAudioCodec('libmp3lame')
      .toFormat('mp3')
      .pipe(uploadStream)
      .on('finish', resolve)
      .on('error', reject);
  });
}
