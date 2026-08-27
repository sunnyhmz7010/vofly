// QTX1-W 接收端：解析屏幕扫到的帧文本，校验 CRC、去白化并按序号重组成文件。
// 协议与 SeigaeLeo/offline-qr-file-transfer QTX1-W V1 保持兼容（支持 S/D/R/W/E 帧）。

import { applyWhitening, base36Decode, crc32, base45Decode, FRAME_HEADER_LENGTH } from './protocol'
import { sha256Hex } from './sha256'

export type ReceivedFile = {
  name: string
  mimeType: string
  bytes: Uint8Array
}

export type ReceiverMeta = {
  sessionId: string
  name: string
  mimeType: string
  size: number
  chunkSize: number
  totalChunks: number
}

export type FeedResult =
  | { event: 'ignored'; reason?: string }
  | { event: 'meta'; meta: ReceiverMeta }
  | { event: 'progress'; received: number; total: number }
  | { event: 'round_end' }
  | { event: 'complete'; file: ReceivedFile }

export class Qtx1wReceiver {
  private sessionId = ''
  private totalChunks = 0
  private size = 0
  private chunkSize = 0
  private name = 'received.bin'
  private mimeType = 'application/octet-stream'
  private sha256 = ''
  private chunks = new Map<number, Uint8Array>()

  get receivedCount(): number {
    return this.chunks.size
  }

  get total(): number {
    return this.totalChunks
  }

  get isComplete(): boolean {
    return this.totalChunks > 0 && this.chunks.size === this.totalChunks
  }

  get currentMeta(): ReceiverMeta | null {
    if (!this.sessionId || !this.totalChunks) return null
    return {
      sessionId: this.sessionId,
      name: this.name,
      mimeType: this.mimeType,
      size: this.size,
      chunkSize: this.chunkSize,
      totalChunks: this.totalChunks
    }
  }

  // 喂入一帧二维码解码文本；CRC 不合法或格式不对时返回 ignored，不抛错（扫码噪声很常见）
  feed(text: string): FeedResult {
    const trimmed = text.trim()
    if (!trimmed.startsWith('QTX1') || trimmed.length < FRAME_HEADER_LENGTH) {
      return { event: 'ignored', reason: 'not_qtx1' }
    }
    let parsed: ReturnType<typeof parseFrameText>
    try {
      parsed = parseFrameText(trimmed)
    } catch {
      return { event: 'ignored', reason: 'invalid_frame' }
    }

    // 会话切换：新会话的第一帧重置全部状态
    if (this.sessionId && parsed.sessionId !== this.sessionId) this.reset()
    this.sessionId = parsed.sessionId

    switch (parsed.type) {
      case 'S':
        return this.acceptMetadata(parsed)
      case 'W':
      case 'D':
      case 'R':
        return this.acceptDataChunk(parsed)
      case 'E':
        return { event: 'round_end' }
      default:
        return { event: 'ignored' }
    }
  }

  reset(): void {
    this.sessionId = ''
    this.totalChunks = 0
    this.size = 0
    this.chunkSize = 0
    this.name = 'received.bin'
    this.mimeType = 'application/octet-stream'
    this.sha256 = ''
    this.chunks.clear()
  }

  private acceptMetadata(parsed: ParsedFrame): FeedResult {
    let metadata: Record<string, unknown>
    try {
      metadata = JSON.parse(new TextDecoder().decode(parsed.payload)) as Record<string, unknown>
    } catch {
      return { event: 'ignored', reason: 'bad_metadata' }
    }
    if (metadata.v !== 1) return { event: 'ignored', reason: 'unsupported_version' }
    this.name = typeof metadata.n === 'string' && metadata.n ? metadata.n : 'received.bin'
    this.mimeType = typeof metadata.m === 'string' && metadata.m ? metadata.m : 'application/octet-stream'
    this.size = Number(metadata.s) || 0
    this.chunkSize = Number(metadata.c) || 0
    const totalChunks = Number(metadata.t) || 0
    this.sha256 = String(metadata.h ?? '').toUpperCase()
    // 协议每 64 个数据帧会重复发送元数据帧：同一文件的重复 S 帧必须保留已收分片，
    // 仅在分片总数变化（真正的重新开始）时才清空进度
    if (totalChunks !== this.totalChunks) {
      this.chunks.clear()
      this.totalChunks = totalChunks
    }
    return { event: 'meta', meta: this.currentMeta! }
  }

  private acceptDataChunk(parsed: ParsedFrame): FeedResult {
    if (!this.totalChunks || this.chunks.has(parsed.index)) {
      return { event: 'ignored', reason: this.chunks.has(parsed.index) ? 'duplicate' : 'missing_metadata' }
    }
    let chunk: Uint8Array
    if (parsed.type === 'W') {
      if (parsed.payload.length < 1) return { event: 'ignored', reason: 'empty_w_payload' }
      const seed = parsed.payload[0]
      chunk = parsed.payload.slice(1)
      applyWhitening(chunk, this.sessionId, parsed.index, seed)
    } else if (parsed.type === 'R') {
      chunk = parsed.payload.slice(1)
    } else {
      chunk = parsed.payload.slice()
    }
    this.chunks.set(parsed.index, chunk)

    if (this.isComplete) {
      const assembled = this.assemble()
      if (!assembled) {
        // 长度或哈希不符：保留进度等待更多轮次，但清空已组装缓存避免误交付
        return { event: 'progress', received: this.chunks.size, total: this.totalChunks }
      }
      return { event: 'complete', file: assembled }
    }
    return { event: 'progress', received: this.chunks.size, total: this.totalChunks }
  }

  private assemble(): ReceivedFile | null {
    const parts: Uint8Array[] = []
    for (let index = 0; index < this.totalChunks; index++) {
      parts.push(this.chunks.get(index)!)
    }
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) {
      bytes.set(part, offset)
      offset += part.length
    }
    if (bytes.length !== this.size) return null
    if (sha256Hex(bytes) !== this.sha256) return null
    return { name: this.name, mimeType: this.mimeType, bytes }
  }
}

type ParsedFrame = {
  type: 'S' | 'D' | 'R' | 'W' | 'E'
  sessionId: string
  index: number
  total: number
  payload: Uint8Array
}

function parseFrameText(text: string): ParsedFrame {
  const type = text[4]
  if (!['S', 'D', 'R', 'W', 'E'].includes(type)) throw new Error(`未知帧类型 ${type}`)
  for (let i = 5; i < 15; i++) if (!isHex(text[i])) throw new Error('会话 ID 含非十六进制字符')
  const payload = base45Decode(text.slice(FRAME_HEADER_LENGTH))
  const expectedCrc = parseInt(text.slice(27, 35), 16)
  if (crc32(payload) !== expectedCrc) throw new Error('CRC32 校验失败')
  return {
    type: type as ParsedFrame['type'],
    sessionId: text.slice(5, 15),
    index: base36Decode(text.slice(15, 21)),
    total: base36Decode(text.slice(21, 27)),
    payload
  }
}

function isHex(character: string): boolean {
  const upper = character.toUpperCase()
  return (character >= '0' && character <= '9') || (upper >= 'A' && upper <= 'F')
}
