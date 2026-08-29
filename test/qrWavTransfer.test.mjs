import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("phone page exposes WAV recordings through QTX1-W QR transfer", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");
  const qrModal = await source("src/components/QrSendModal.tsx");

  assert.match(phonePage, /QrSendModal/);
  assert.match(phonePage, /\/api\/call-recordings\/\$\{encodeURIComponent\(record\.callId\)\}/);
  assert.match(phonePage, /audio\/wav/);
  assert.match(phonePage, /二维码发送/);
  assert.match(qrModal, /new Worker\(new URL\("\.\.\/lib\/qtx1w\/qrWorker\.ts", import\.meta\.url\)/);
  assert.match(qrModal, /frameDurationMs/);
  assert.match(qrModal, /estimateRoundMs/);
  assert.match(qrModal, /canvas/);
});

test("QR transfer maps MP3 recordings to audio/mpeg while keeping the WAV default", async () => {
  const phonePage = await source("src/pages/PhonePage.tsx");

  assert.match(phonePage, /QR_WAV_MIME_TYPE = "audio\/wav"/);
  assert.match(phonePage, /"audio\/mpeg"/);
  assert.match(phonePage, /\.mp3/);
  assert.match(phonePage, /recordingMimeType\(record\.recordingPath\)/);
});

test("QR receive offline service worker is shipped", async () => {
  await access(new URL("public/sw.js", root));
  const worker = await source("public/sw.js");

  assert.match(worker, /vofly-qr-receive/);
  assert.match(worker, /\/qr-receive|navigate/);
  assert.match(worker, /\/assets\//);
});

test("installer scripts follow current VOFLY environment layout with opt-in ffmpeg", async () => {
  const install = await source("install.sh");
  const update = await source("update.sh");
  const uninstall = await source("uninstall.sh");
  const joined = [install, update, uninstall].join("\n");

  assert.match(install, /DEFAULT_ADDR="0\.0\.0\.0:7575"/);
  assert.match(install, /DEFAULT_DATABASE="\/opt\/vofly\/data\/vofly\.db"/);
  assert.match(install, /VOFLY_ADDR=%s/);
  assert.match(install, /VOFLY_DATABASE_PATH=%s/);
  assert.match(install, /EnvironmentFile=\/etc\/vofly\/env/);
  assert.match(install, /ExecStart=\/opt\/vofly\/bin\/vofly serve/);
  assert.match(install, /--with-pcsc/);
  assert.match(install, /--with-ffmpeg/);
  assert.match(install, /install_ffmpeg_support/);
  assert.match(install, /install_ffmpeg_packages/);
  assert.match(update, /vofly_/);
  assert.match(uninstall, /--purge/);

  // 录音转码只允许调用外部 ffmpeg 二进制；不得捆绑或直连 lame/amr 编解码库。
  assert.doesNotMatch(joined, /libmp3lame|opencore-amr|vofly -c|config\.yaml/);
});

test("installer bootstraps the access secret and exposes the vofly CLI without storing credentials", async () => {
  const install = await source("install.sh");
  const update = await source("update.sh");

  assert.match(install, /--force/);
  assert.match(install, /FIRST_INSTALL=0/);
  assert.match(install, /INITIAL_ADMIN_PASSWORD=""/);
  assert.match(install, /bootstrap-admin --database "\$DEFAULT_DATABASE"/);
  assert.match(install, /首次安装已生成访问密令/);
  assert.match(install, /LINK_PATH="\/usr\/local\/bin\/vofly"/);
  assert.match(update, /LINK_PATH="\/usr\/local\/bin\/vofly"/);
  assert.match(install, /ln -sfn "\$BINARY_PATH" "\$LINK_PATH"/);
  assert.match(update, /ln -sfn "\$BINARY_PATH" "\$LINK_PATH"/);
  assert.match(install, /AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW/);
  assert.match(install, /ReadWritePaths=\/opt\/vofly\/data \/opt\/vofly\/bin/);

  assert.doesNotMatch(install, /--username/);
  assert.doesNotMatch(install, /^VOFLY_ADMIN_USERNAME=/m);
  assert.doesNotMatch(install, /^VOFLY_ADMIN_PASSWORD=/m);
  assert.doesNotMatch(install, /^VOFLY_ADMIN_PASSWORD_B64=/m);
});
