import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import OpenAI from 'openai';

const run = promisify(execFile);
const SEGMENT_SECONDS = 28; // 單段上限為 30 秒，保留一點餘裕

// 轉成 16 kHz 單聲道 WAV，並切成固定長度的片段
async function splitAudio(source: string, outputDir: string): Promise<string[]> {
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', source,
    '-ac', '1', '-ar', '16000',
    '-f', 'segment', '-segment_time', String(SEGMENT_SECONDS),
    '-c:a', 'pcm_s16le',
    path.join(outputDir, 'chunk_%03d.wav'),
  ]);

  const files = await readdir(outputDir);
  return files.sort().map((file) => path.join(outputDir, file));
}

const client = new OpenAI({
  baseURL: 'http://localhost:8080/v1', // 指向 llama-server
  apiKey: 'llama.cpp',                 // 本機伺服器不驗證金鑰，填任意字串即可
});

// #1 兩處語言都填 Traditional Chinese
const PROMPT = `Transcribe the following speech segment in Traditional Chinese into Traditional Chinese text.

Follow these specific instructions for formatting the answer:
* Only output the transcription, with no newlines.
* When transcribing numbers, write the digits, i.e. write 1.7 and not one point seven, and write 3 instead of three.`;

async function transcribeChunk(chunk: string): Promise<string> {
  const audio = await readFile(chunk);

  const completion = await client.chat.completions.create({
    model: 'gemma-4-E4B-it', // 伺服器只載入一個模型時，這個名稱不影響結果
    messages: [
      {
        role: 'user',
        content: [ // #2 音訊放在文字前面
          { type: 'input_audio', input_audio: { data: audio.toString('base64'), format: 'wav' } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
    temperature: 0, // 轉錄不需要創意
    max_tokens: 512,
    // @ts-expect-error `llama.cpp` 的擴充參數，不在 OpenAI SDK 的型別定義中
    chat_template_kwargs: { enable_thinking: false }, // #3 關閉思考模式
  });

  const choice = completion.choices[0];
  if (choice.finish_reason === 'length') {
    console.warn(`警告：${path.basename(chunk)} 的輸出達到 max_tokens 上限，內容可能不完整`);
  }

  return choice.message.content?.trim() ?? '';
}

const source = process.argv[2];
if (!source) {
  console.error('用法：npx tsx transcribe.ts <音檔路徑>');
  process.exit(1);
}

const workDir = await mkdtemp(path.join(tmpdir(), 'gemma-llamacpp-'));
const lines: string[] = [];

try {
  const chunks = await splitAudio(source, workDir);

  for (const [index, chunk] of chunks.entries()) {
    const text = await transcribeChunk(chunk);
    const start = index * SEGMENT_SECONDS;
    const minutes = String(Math.floor(start / 60)).padStart(2, '0');
    const seconds = String(start % 60).padStart(2, '0');

    const line = `[${minutes}:${seconds}] ${text}`;
    console.log(line);
    lines.push(line);
  }
} finally {
  await rm(workDir, { recursive: true, force: true }); // 暫存的音檔片段不留在磁碟上
}

const { dir, name } = path.parse(source);
await writeFile(path.join(dir, `${name}.txt`), lines.join('\n') + '\n', 'utf-8');
