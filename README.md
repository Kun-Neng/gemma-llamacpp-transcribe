# gemma-llamacpp-transcribe

用 [llama.cpp](https://github.com/ggml-org/llama.cpp) 與 Gemma 4 在本機把錄音檔轉成逐字稿的命令列工具，錄音內容全程不離開你的電腦。

設定的原因、影響準確度的關鍵設定與常見陷阱，請見文章：[用 llama.cpp 與 TypeScript 實作 Gemma 4 語音轉文字](https://kun-neng.github.io/2026/11/05/%E7%94%A8-llama-cpp-%E8%88%87-TypeScript-%E5%AF%A6%E4%BD%9C-Gemma-4-%E8%AA%9E%E9%9F%B3%E8%BD%89%E6%96%87%E5%AD%97/)

> [`gemma4`](https://github.com/Kun-Neng/gemma-llamacpp-transcribe/tree/gemma4) tag 是文章對應的版本。

## 需求

- Node.js 22 以上（`openai` 套件的最低需求）
- [ffmpeg](https://ffmpeg.org/download.html)，需在 PATH 上
- 已啟動的 `llama-server`，監聽 8080 port：

  ```bash
  llama-server -hf google/gemma-4-E4B-it-qat-q4_0-gguf -hff gemma-4-E4B_q4_0-it.gguf -c 8192 -np 1 --port 8080
  ```

  顯示卡記憶體不足時，可改用 E2B：`-hf google/gemma-4-E2B-it-qat-q4_0-gguf -hff gemma-4-E2B_q4_0-it.gguf`。

  若 `llama-server` 不是跑在 8080 port，請一併修改 `transcribe.ts` 裡的 `baseURL`。

## 使用方式

```bash
npm install
npx tsx transcribe.ts ./meeting.wav
```

支援 ffmpeg 能讀取的格式（WAV、MP3、M4A 等）。程式會把音檔轉成 16 kHz 單聲道 WAV、切成 28 秒的片段，逐段送給 `llama-server` 轉錄。

預設的提示詞是把中文語音轉成繁體中文文字。要轉其他語言的錄音，請把 `transcribe.ts` 中 `PROMPT` 裡的兩處 `Traditional Chinese` 都改成該語言。

## 輸出

逐字稿會逐段顯示在終端機，並存成與音檔同名的 `.txt`（例如 `meeting.txt`），放在音檔所在的資料夾。同名檔案已存在時會直接覆蓋，不會提示：

```text
[00:00] 第一段的轉錄文字
[00:28] 第二段的轉錄文字
```

時間標記是依片段順序推算的起始時間，只能用來大致定位。
