// QTX1-W 发送端 Worker：在后台线程完成分片编码与二维码矩阵生成，
// 主线程只做绘制与节拍控制，避免 version-40 编码阻塞 UI。

import QRCode from 'qrcode'
import { TransferSession } from './protocol'
import { eccLevelForLength, scheduleIterator } from './playback'
import type { FrameSpec } from './playback'

type InitMessage = {
  type: 'init'
  data: ArrayBuffer
  fileName: string
  mimeType: string
  chunkSize: number
}

type NextMessage = { type: 'next' }

type StopMessage = { type: 'stop' }

export type ReadyReply = {
  type: 'ready'
  sessionId: string
  totalChunks: number
  chunkSize: number
  fileSize: number
  fileName: string
}

export type FrameReply = {
  type: 'frame'
  entry: number
  round: number
  displayIndex: number
  scheduleCount: number
  size: number
  modules: ArrayBuffer
}

export type WorkerErrorReply = { type: 'error'; message: string }

const BUFFER_LIMIT = 16

let iterator: Generator<FrameSpec> | null = null
const queue: FrameSpec[] = []

self.onmessage = (event: MessageEvent<InitMessage | NextMessage | StopMessage>) => {
  const message = event.data
  if (message.type === 'init') {
    try {
      const session = TransferSession.create(
        new Uint8Array(message.data),
        message.fileName,
        message.mimeType,
        message.chunkSize
      )
      iterator = scheduleIterator(session)
      queue.length = 0
      const ready: ReadyReply = {
        type: 'ready',
        sessionId: session.sessionId,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        fileSize: session.data.length,
        fileName: session.fileName
      }
      self.postMessage(ready)
    } catch (error) {
      replyError(error)
    }
    return
  }
  if (message.type === 'next') {
    handleNext()
    return
  }
  if (message.type === 'stop') {
    iterator = null
    queue.length = 0
  }
}

// 每次 next 恰好回复一帧：优先消费预生成缓冲，缓冲为空则同步编码一帧；
// 应答后把缓冲补满，吸收主线程取帧节奏的抖动。
function handleNext(): void {
  if (!iterator) return
  let spec = queue.shift()
  if (!spec) {
    let result: IteratorResult<FrameSpec>
    try {
      result = iterator.next()
    } catch (error) {
      replyError(error)
      return
    }
    if (result.done) return
    spec = result.value
  }
  const reply = encodeFrame(spec)
  self.postMessage(reply)
  try {
    while (queue.length < BUFFER_LIMIT) {
      const result = iterator.next()
      if (result.done) break
      queue.push(result.value)
    }
  } catch (error) {
    replyError(error)
  }
}

function encodeFrame(spec: FrameSpec): FrameReply | WorkerErrorReply {
  try {
    const level = eccLevelForLength(spec.raw.length)
    const qr = QRCode.create(spec.raw, { errorCorrectionLevel: level })
    const size = qr.modules.size
    const source = qr.modules.data
    // 拷贝为可转移的模块位图：1 表示黑色模块
    const modules = new Uint8Array(size * size)
    for (let i = 0; i < modules.length; i++) {
      modules[i] = source[i] & 1 ? 1 : 0
    }
    return {
      type: 'frame',
      entry: spec.entry,
      round: spec.round,
      displayIndex: spec.displayIndex,
      scheduleCount: spec.scheduleCount,
      size,
      modules: modules.buffer
    }
  } catch (error) {
    return { type: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

function replyError(error: unknown): void {
  const reply: WorkerErrorReply = { type: 'error', message: error instanceof Error ? error.message : String(error) }
  self.postMessage(reply)
}
