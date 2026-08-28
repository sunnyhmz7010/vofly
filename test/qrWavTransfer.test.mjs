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

  assert.match(install, /DEFAULT_ADDR="0\.0\.0\.0:7575"/);
  assert.match(install, /DEFAULT_DATABASE="\/opt\/vofly\/data\/vofly\.db"/);
  assert.match(install, /VOFLY_ADDR=%s/);
  assert.match(install, /VOFLY_DATABASE_PATH=%s/);
  assert.match(install, /EnvironmentFile=\/etc\/vofly\/env/);
  assert.match(install, /ExecStart=\/opt\/vofly\/bin\/vofly serve/);
  assert.match(install, /--with-pcsc/);
  assert.match(update, /vofly_/);
  assert.match(uninstall, /--purge/);

  assert.doesNotMatch(joined, /libmp3lame|opencore-amr|ffmpeg|vofly -c|config\.yaml/);
});

test("installer bootstraps first admin and exposes the vofly CLI without storing secrets", async () => {
  const install = await source("install.sh");
  const update = await source("update.sh");

  assert.match(install, /--force/);
  assert.match(install, /FIRST_INSTALL=0/);
  assert.match(install, /INITIAL_ADMIN_PASSWORD=""/);
  assert.match(install, /bootstrap-admin --database "\$DEFAULT_DATABASE" --username admin/);
  assert.match(install, /首次安装已生成管理员初始密码/);
  assert.match(install, /用户名：admin/);
  assert.match(install, /LINK_PATH="\/usr\/local\/bin\/vofly"/);
  assert.match(update, /LINK_PATH="\/usr\/local\/bin\/vofly"/);
  assert.match(install, /ln -sfn "\$BINARY_PATH" "\$LINK_PATH"/);
  assert.match(update, /ln -sfn "\$BINARY_PATH" "\$LINK_PATH"/);
  assert.match(install, /AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW/);
  assert.match(install, /ReadWritePaths=\/opt\/vofly\/data \/opt\/vofly\/bin/);

  assert.doesNotMatch(install, /^VOFLY_ADMIN_USERNAME=/m);
  assert.doesNotMatch(install, /^VOFLY_ADMIN_PASSWORD=/m);
  assert.doesNotMatch(install, /^VOFLY_ADMIN_PASSWORD_B64=/m);
});
