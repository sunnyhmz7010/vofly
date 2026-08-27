// 根据文件扩展名推断 MIME（覆盖 vofly 场景常见类型，未知回落二进制流）
const EXTENSION_TYPES: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  json: 'application/json',
  pdf: 'application/pdf',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  amr: 'audio/amr',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm'
}

export function mimeForFileName(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName)
  return match ? EXTENSION_TYPES[match[1].toLowerCase()] ?? 'application/octet-stream' : 'application/octet-stream'
}
