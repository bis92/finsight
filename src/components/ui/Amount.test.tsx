import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Amount } from '@/components/ui/Amount'

describe('Amount', () => {
  it('renders an expense with KRW formatting and the expense color', () => {
    const markup = renderToStaticMarkup(<Amount value={1234567} direction="expense" />)

    expect(markup).toContain('1,234,567원')
    expect(markup).toContain('text-semantic-down')
    expect(markup).toContain('font-mono')
    expect(markup).toContain('tabular-nums')
  })

  it('renders income with the income color', () => {
    const markup = renderToStaticMarkup(<Amount value={3200000} direction="income" />)

    expect(markup).toContain('3,200,000원')
    expect(markup).toContain('text-semantic-up')
  })
})
