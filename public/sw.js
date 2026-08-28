// vofly 二维码接收页离线缓存 Service Worker。
// 仅服务 /qr-receive 扫码场景：应用外壳 + 构建产物采用缓存优先，后台静默更新；
// 其余请求一律直连网络。更新 CACHE_VERSION 可强制刷新旧缓存。

const CACHE_VERSION = 'vofly-qr-receive-v2'
const SHELL_URLS = ['/', '/index.html', '/favicon-32.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 页面导航：网络优先保证更新即时生效，离线时回落到外壳缓存。
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy))
            }
            return response
          })
          .catch(() => cached)
        return network
      })
    )
    return
  }

  // 静态资源（Vite 构建产物带内容哈希）：缓存优先，后台更新。
  if (url.pathname.startsWith('/assets/') || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone())
              return response
            })
            .catch(() => cached)
          return cached || network
        })
      )
    )
  }
})
