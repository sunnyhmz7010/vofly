// QTX1-W 播放调度（移植自 SeigaeLeo/offline-qr-file-transfer windows-sender-v1.7.1/FramePlaybackEngine.cs，GPL-3.0）
// 负责轮次循环、元数据帧停留策略与 ECC 等级选择；QR 矩阵生成由 Worker 承担。

import { METADATA_REPEAT_DATA_FRAMES } from './protocol'
import type { TransferSession } from './protocol'

export const INITIAL_METADATA_DWELL_MS = 500
export const METADATA_DWELL_MS = 100
export const MIN_FPS = 2
export const MAX_FPS = 60

export type ScheduleEntry = -1 | -2 | number

export type FrameSpec = {
  raw: string
  entry: ScheduleEntry
  round: number
  /** 本轮内的显示序号（从 1 开始），用于元数据停留策略 */
  displayIndex: number
  scheduleCount: number
}

export type EccLevel = 'L' | 'M' | 'Q' | 'H'

// 与参考实现一致：短帧用高冗余 Q，长帧逐级降为 M / L
export function eccLevelForLength(rawLength: number): EccLevel {
  if (rawLength <= 2400) return 'Q'
  if (rawLength <= 3370) return 'M'
  return 'L'
}

export function clampFps(fps: number): number {
  return Math.min(MAX_FPS, Math.max(MIN_FPS, fps))
}

// 单帧展示时长：S 帧首轮首帧停 500ms，其余 S 帧 100ms；数据帧按目标 FPS
export function frameDurationMs(entry: ScheduleEntry, fps: number, round = 1, displayIndex = 1): number {
  if (entry === -1) return metadataDwellMs(round, displayIndex)
  return 1000 / clampFps(fps)
}

function metadataDwellMs(round: number, displayIndex: number): number {
  return round === 1 && displayIndex === 1 ? INITIAL_METADATA_DWELL_MS : METADATA_DWELL_MS
}

// 无限遍历发送计划：轮次递增，每轮按计划顺序产出帧规格（调用方负责停止）
export function* scheduleIterator(session: TransferSession, startRound = 1, startIndex = 0): Generator<FrameSpec> {
  let round = Math.max(1, startRound)
  let index = Math.max(0, startIndex)
  while (true) {
    const schedule = session.getScheduleForRound(round)
    if (index >= schedule.length) {
      round++
      index = 0
      continue
    }
    const entry = schedule[index]
    yield {
      raw: session.getFrameForScheduleEntry(entry, round),
      entry,
      round,
      displayIndex: index + 1,
      scheduleCount: schedule.length
    }
    index++
  }
}

// 发送一轮所需的近似时长（毫秒）：用于 UI 预估单轮耗时
export function estimateRoundMs(totalChunks: number, fps: number): number {
  const dataFrames = totalChunks
  const metadataFrames = Math.ceil(Math.max(1, totalChunks) / METADATA_REPEAT_DATA_FRAMES)
  const endFrames = 3
  const perDataFrame = 1000 / clampFps(fps)
  const firstMetadata = metadataFrames > 0 ? (INITIAL_METADATA_DWELL_MS - METADATA_DWELL_MS) : 0
  return Math.round(dataFrames * perDataFrame + metadataFrames * METADATA_DWELL_MS + endFrames * perDataFrame + firstMetadata)
}
