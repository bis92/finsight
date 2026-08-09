import { describe, it, expect } from 'vitest'
import { decideGate } from './review-gate.mjs'

describe('decideGate', () => {
  it('critical 있으면 차단 + REQUEST_CHANGES', () => {
    expect(decideGate({ critical: 1, major: 0, minor: 0, nit: 0 })).toEqual({
      event: 'REQUEST_CHANGES', automerge: false, blocked: true,
    })
  })
  it('major 있으면 차단(다른 심각도 무관)', () => {
    expect(decideGate({ critical: 0, major: 2, minor: 3, nit: 5 })).toEqual({
      event: 'REQUEST_CHANGES', automerge: false, blocked: true,
    })
  })
  it('minor까지면 APPROVE·자동머지 안 함', () => {
    expect(decideGate({ critical: 0, major: 0, minor: 1, nit: 4 })).toEqual({
      event: 'APPROVE', automerge: false, blocked: false,
    })
  })
  it('nit만이면 APPROVE + 자동머지', () => {
    expect(decideGate({ critical: 0, major: 0, minor: 0, nit: 3 })).toEqual({
      event: 'APPROVE', automerge: true, blocked: false,
    })
  })
  it('무결점이면 APPROVE + 자동머지', () => {
    expect(decideGate({ critical: 0, major: 0, minor: 0, nit: 0 })).toEqual({
      event: 'APPROVE', automerge: true, blocked: false,
    })
  })
  it('counts 필드 누락은 0으로 취급', () => {
    expect(decideGate({})).toEqual({
      event: 'APPROVE', automerge: true, blocked: false,
    })
  })
})
