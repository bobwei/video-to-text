import fs from 'fs';
import 'dotenv/config';
import { Storage } from '@google-cloud/storage';
import ytdl from 'ytdl-core';
import speech from '@google-cloud/speech';
import ffmpeg from 'fluent-ffmpeg';
import * as R from 'ramda';

const credentials = JSON.parse(Buffer.from(process.env.SERVICE_ACCOUNT_JSON, 'base64'));

(async () => {
  const bucketName = 'line-tracker-19d25.appspot.com';
  const gcsPath = 'video-to-text/audios/OpHHmjahk4Y.mp3';
  const videoUrl = 'https://www.youtube.com/watch?v=OpHHmjahk4Y';
  const storage = new Storage({ credentials });

  console.log('uploading...');
  await uploadToGCS({ storage, bucketName, gcsPath, videoUrl });
  console.log('done uploading');

  const speechClient = new speech.SpeechClient({ credentials });
  const request = {
    config: {
      encoding: 'mp3',
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
      enableAutomaticPunctuation: true,
    },
    audio: {
      uri: `gs://${bucketName}/${gcsPath}`,
    },
  };
  const [operation] = await speechClient.longRunningRecognize(request);
  const [response] = await operation.promise();
  fs.writeFileSync('dist/response.json', JSON.stringify(response));
  const result = R.pipe(
    R.path(['results']),
    R.map(R.path(['alternatives', '0', 'transcript'])),
    R.join('\n'),
  )(response);
  fs.writeFileSync('dist/output.json', JSON.stringify(result));
})();

async function uploadToGCS({ storage, bucketName, gcsPath, videoUrl }) {
  if ((await storage.bucket(bucketName).file(gcsPath).exists())[0]) {
    return Promise.resolve();
  }
  return new Promise(async (resolve, reject) => {
    const uploadStream = storage.bucket(bucketName).file(gcsPath).createWriteStream();
    const { info, stream: ytVideoStream } = await ytdl
      .getInfo(videoUrl, { quality: 'highestaudio' })
      .then((data) => {
        return {
          info: data,
          stream: ytdl.downloadFromInfo(data, {
            quality: 'highestaudio',
          }),
        };
      });
    ffmpeg(ytVideoStream)
      .setFfmpegPath(require('ffmpeg-static'))
      .audioBitrate(info.formats[0].audioBitrate)
      .withAudioCodec('libmp3lame')
      .toFormat('mp3')
      .pipe(uploadStream)
      .on('finish', () => resolve({ info }))
      .on('error', reject);
  });
}
