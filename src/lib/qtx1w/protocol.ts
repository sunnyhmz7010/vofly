// QTX1-W V1 协议编码（移植自 SeigaeLeo/offline-qr-file-transfer windows-sender-v1.7.1/TransferProtocol.cs，GPL-3.0）
// 帧结构：QTX1 + 类型 + 10 位会话 ID + Base36 序号(6) + Base36 总数(6) + CRC32 十六进制(8) + Base45 载荷

import { sha256Hex } from './sha256'

export const QTX1_MAGIC = 'QTX1'
export const FRAME_HEADER_LENGTH = 35
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const METADATA_REPEAT_DATA_FRAMES = 64
export const MIN_CHUNK_SIZE = 100
export const MAX_CHUNK_SIZE = 2800

const BASE36_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

export type FrameType = 'S' | 'D' | 'R' | 'W' | 'E'

export type Qtx1wMetadata = {
  v: number
  n: string
  m: string
  s: number
  c: number
  t: number
  h: string
  z: string
  e: string
  w: string
}

// ---------------------------------------------------------------------------
// CRC32（IEEE，多项式 0xEDB88320）
// ---------------------------------------------------------------------------

const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
    table[i] = crc >>> 0
  }
  return table
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let offset = 0; offset < data.length; offset++) {
    crc = CRC_TABLE[(crc ^ data[offset]) & 0xff] ^ (crc >>> 8)
  }
  return (~crc) >>> 0
}

// ---------------------------------------------------------------------------
// Base36 / Base45
// ---------------------------------------------------------------------------

export function base36Encode(value: number, width: number): string {
  if (value < 0) throw new RangeError('Base36 编码不接受负数')
  const buffer = new Array<string>(width).fill('0')
  let rest = value
  for (let i = width - 1; i >= 0 && rest > 0; i--) {
    buffer[i] = BASE36_ALPHABET[rest % 36]
    rest = Math.floor(rest / 36)
  }
  if (rest !== 0) throw new RangeError('数值超过固定宽度')
  return buffer.join('')
}

export function base36Decode(text: string): number {
  let value = 0
  for (const character of text) {
    const digit = BASE36_ALPHABET.indexOf(character)
    if (digit < 0) throw new Error(`无效的 Base36 字符：${character}`)
    value = value * 36 + digit
  }
  return value
}

export function base45Encode(data: Uint8Array): string {
  const builder: string[] = []
  let i = 0
  while (i + 1 < data.length) {
    const value = data[i] * 256 + data[i + 1]
    builder.push(BASE45_ALPHABET[value % 45])
    builder.push(BASE45_ALPHABET[Math.floor(value / 45) % 45])
    builder.push(BASE45_ALPHABET[Math.floor(value / (45 * 45))])
    i += 2
  }
  if (i < data.length) {
    const value = data[i]
    builder.push(BASE45_ALPHABET[value % 45])
    builder.push(BASE45_ALPHABET[Math.floor(value / 45)])
  }
  return builder.join('')
}

export function base45Decode(text: string): Uint8Array {
  if (text.length % 3 === 1) throw new Error('无效的 Base45 长度')
  const output = new Uint8Array(Math.floor((text.length * 2) / 3) + 1)
  let written = 0
  let i = 0
  while (i < text.length) {
    const c = base45ValueOf(text[i])
    const d = base45ValueOf(text[i + 1])
    if (i + 2 < text.length) {
      const e = base45ValueOf(text[i + 2])
      const value = c + d * 45 + e * 45 * 45
      if (value > 0xffff) throw new Error('无效的 Base45 三字符组')
      output[written++] = Math.floor(value / 256)
      output[written++] = value % 256
      i += 3
    } else {
      const value = c + d * 45
      if (value > 0xff) throw new Error('无效的 Base45 双字符组')
      output[written++] = value
      i += 2
    }
  }
  return output.subarray(0, written)
}

function base45ValueOf(character: string): number {
  const value = BASE45_ALPHABET.indexOf(character)
  if (value < 0) throw new Error(`无效的 Base45 字符：${character}`)
  return value
}

// ---------------------------------------------------------------------------
// 载荷白化（XORSHIFT32，种子由会话 ID、分片序号与轮次种子派生；异或对称可逆）
// ---------------------------------------------------------------------------

export function applyWhitening(payload: Uint8Array, sessionId: string, index: number, seed: number): void {
  let state = 2166136261
  for (let i = 0; i < sessionId.length; i++) {
    state = ((state ^ sessionId.charCodeAt(i)) >>> 0)
    state = Math.imul(state, 16777619) >>> 0
  }
  state = (state ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0
  state = (state ^ Math.imul(seed, 0x85ebca6b)) >>> 0
  if (state === 0) state = 0xa5366b4d

  for (let offset = 0; offset < payload.length; offset++) {
    state = ((state ^ (state << 13)) >>> 0)
    state = ((state ^ (state >>> 17)) >>> 0)
    state = ((state ^ (state << 5)) >>> 0)
    payload[offset] = payload[offset] ^ (state & 0xff)
  }
}

// ---------------------------------------------------------------------------
// 帧构造
// ---------------------------------------------------------------------------

export function createFrame(
  type: FrameType,
  sessionId: string,
  index: number,
  total: number,
  payload: Uint8Array
): string {
  if (sessionId.length !== 10 || [...sessionId].some((c) => !isHexDigit(c))) {
    throw new Error('会话 ID 必须是 10 位十六进制字符')
  }
  const header =
    QTX1_MAGIC +
    type +
    sessionId.toUpperCase() +
    base36Encode(index, 6) +
    base36Encode(total, 6) +
    crc32(payload).toString(16).toUpperCase().padStart(8, '0')
  return header + base45Encode(payload)
}

export type ParsedFrame = {
  type: FrameType
  sessionId: string
  index: number
  total: number
  payload: Uint8Array
}

// 解析并校验一帧：CRC32 覆盖解码后的原始载荷，失败直接抛错
export function parseFrame(text: string): ParsedFrame {
  if (!text.startsWith(QTX1_MAGIC) || text.length <= FRAME_HEADER_LENGTH) {
    throw new Error('不是有效的 QTX1 帧')
  }
  const type = text[4] as FrameType
  if (!['S', 'D', 'R', 'W', 'E'].includes(type)) throw new Error(`未知的帧类型：${type}`)
  const sessionId = text.slice(5, 15)
  const index = base36Decode(text.slice(15, 21))
  const total = base36Decode(text.slice(21, 27))
  const expectedCrc = parseInt(text.slice(27, 35), 16)
  const payload = base45Decode(text.slice(FRAME_HEADER_LENGTH))
  if (crc32(payload) !== expectedCrc) throw new Error('帧 CRC32 校验失败')
  return { type, sessionId, index, total, payload }
}

function isHexDigit(character: string): boolean {
  const upper = character.toUpperCase()
  return (character >= '0' && character <= '9') || (upper >= 'A' && upper <= 'F')
}

// ---------------------------------------------------------------------------
// 发送会话
// ---------------------------------------------------------------------------

export class TransferSession {
  readonly data: Uint8Array
  readonly fileName: string
  readonly mimeType: string
  readonly chunkSize: number
  readonly totalChunks: number
  readonly sessionId: string
  readonly sha256Hex: string
  readonly startFrame: string
  readonly endFrame: string

  private readonly firstRoundSchedule: number[]
  private readonly scheduleCache = new Map<number, number[]>()

  static create(data: Uint8Array, fileName: string, mimeType: string, chunkSize: number): TransferSession {
    if (data.length > MAX_FILE_BYTES) {
      throw new Error(`当前版本单次最多发送 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MiB`)
    }
    if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
      throw new Error(`分片大小必须在 ${MIN_CHUNK_SIZE}～${MAX_CHUNK_SIZE} 字节之间`)
    }
    return new TransferSession(data, fileName, mimeType, chunkSize)
  }

  private constructor(data: Uint8Array, fileName: string, mimeType: string, chunkSize: number) {
    this.data = data
    this.fileName = sanitizeFileName(fileName)
    this.mimeType = mimeType
    this.chunkSize = chunkSize
    this.totalChunks = Math.max(1, Math.ceil(data.length / chunkSize))
    this.sessionId = randomSessionId()
    this.sha256Hex = sha256Hex(data)

    // 元数据 JSON 的键顺序与参考实现保持一致（v,n,m,s,c,t,h,z,e,w）
    const metadata: Qtx1wMetadata = {
      v: 1,
      n: this.fileName,
      m: mimeType,
      s: data.length,
      c: chunkSize,
      t: this.totalChunks,
      h: this.sha256Hex,
      z: 'NONE',
      e: 'NONE',
      w: 'XORSHIFT32-V1'
    }
    this.startFrame = createFrame('S', this.sessionId, 0, this.totalChunks, new TextEncoder().encode(JSON.stringify(metadata)))
    this.endFrame = createFrame('E', this.sessionId, this.totalChunks, this.totalChunks, new Uint8Array(0))
    this.firstRoundSchedule = buildSchedule(this.totalChunks, 1)
    this.scheduleCache.set(1, this.firstRoundSchedule)
  }

  getScheduleForRound(round: number): number[] {
    if (round < 1) throw new RangeError('轮次从 1 开始')
    const cached = this.scheduleCache.get(round)
    if (cached) return cached
    const schedule = buildSchedule(this.totalChunks, round)
    this.scheduleCache.set(round, schedule)
    return schedule
  }

  getFrameForScheduleEntry(entry: number, round = 1): string {
    if (entry === -1) return this.startFrame
    if (entry === -2) return this.endFrame
    return this.createDataFrame(entry, round)
  }

  private createDataFrame(index: number, round: number): string {
    const offset = index * this.chunkSize
    const length = Math.min(this.chunkSize, Math.max(0, this.data.length - offset))
    const seed = ((round - 1) % 255) + 1
    const whitenedChunk = new Uint8Array(length + 1)
    whitenedChunk[0] = seed
    whitenedChunk.set(this.data.subarray(offset, offset + length), 1)
    applyWhitening(whitenedChunk.subarray(1), this.sessionId, index, seed)
    return createFrame('W', this.sessionId, index, this.totalChunks, whitenedChunk)
  }
}

function buildSchedule(totalChunks: number, round: number): number[] {
  const schedule: number[] = []
  let dataFramesSinceMetadata = METADATA_REPEAT_DATA_FRAMES
  for (const index of buildDataOrder(totalChunks, round)) {
    if (dataFramesSinceMetadata >= METADATA_REPEAT_DATA_FRAMES) {
      schedule.push(-1)
      dataFramesSinceMetadata = 0
    }
    schedule.push(index)
    dataFramesSinceMetadata++
  }
  schedule.push(-2, -2, -2)
  return schedule
}

// 首轮按 0..t-1 顺序；补发轮次把数据切成最多 16 条带并交错发送，起始条带随轮次旋转
function* buildDataOrder(totalChunks: number, round: number): Generator<number> {
  if (round <= 1 || totalChunks <= 1) {
    for (let index = 0; index < totalChunks; index++) yield index
    return
  }
  const maximumBands = 16
  const bandCount = Math.min(maximumBands, totalChunks)
  const bandSize = Math.ceil(totalChunks / bandCount)
  const rotation = (round - 2) % bandCount
  for (let offset = 0; offset < bandSize; offset++) {
    for (let bandOffset = 0; bandOffset < bandCount; bandOffset++) {
      const band = (bandOffset + rotation) % bandCount
      const index = band * bandSize + offset
      if (index < totalChunks) yield index
    }
  }
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  if (!base.trim()) return 'received.bin'
  const invalid = '<>:"/\\|?*'
  let clean = ''
  for (const character of base) {
    clean += character.charCodeAt(0) < 32 || invalid.includes(character) ? '_' : character
  }
  return clean.length <= 180 ? clean : clean.slice(0, 180)
}

function randomSessionId(): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (const value of bytes) hex += value.toString(16).padStart(2, '0')
  return hex.toUpperCase()
}
