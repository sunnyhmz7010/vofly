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

test("QR receive offline service worker is shipped", async () => {
  await access(new URL("public/sw.js", root));
  const worker = await source("public/sw.js");

  assert.match(worker, /vofly-qr-receive/);
  assert.match(worker, /\/qr-receive|navigate/);
  assert.match(worker, /\/assets\//);
});

test("installer scripts follow current VOFLY environment layout without audio transcode dependencies", async () => {
  const install = await source("install.sh");
  const update = await source("update.sh");
  const uninstall = await source("uninstall.sh");
  const joined = [install, update, uninstall].join("\n");

  assert.match(install, /VOFLY_ADDR=0\.0\.0\.0:7575/);
  assert.match(install, /VOFLY_DATABASE_PATH=\/opt\/vofly\/data\/vofly\.db/);
  assert.match(install, /EnvironmentFile=\/etc\/vofly\/env/);
  assert.match(install, /ExecStart=\/opt\/vofly\/bin\/vofly serve/);
  assert.match(install, /--with-pcsc/);
  assert.match(update, /vofly_/);
  assert.match(uninstall, /--purge/);

  assert.doesNotMatch(joined, /libmp3lame|opencore-amr|ffmpeg|vofly -c|config\.yaml/);
});
