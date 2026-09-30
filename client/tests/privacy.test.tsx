import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GraphNode } from '../src/components/graph/GraphNode'
import { translations } from '../src/i18n/translations'

test('anonymous graph node renders a dark structural point, retains counts and never renders supplied identity', () => {
  for (const language of ['de', 'en'] as const) {
    const html = renderToStaticMarkup(<GraphNode id="structural-id" kind="anonymous" label="PRIVATE-NAME" point={{ x: 100, y: 200, depth: 1 }} connectionCount={3} selected={false} onSelect={() => {}} copy={translations[language]} />)
    assert.ok(!html.includes('PRIVATE-NAME'))
    assert.ok(!html.includes('profile-glyph'))
    assert.ok(!html.includes('node-label'))
    assert.ok(html.includes('graph-node--anonymous'))
    assert.ok(html.includes('class="node-body" r="6"'))
    assert.ok(html.includes(translations[language].nodeDescription(translations[language].anonymous, 1, 3)))
    assert.equal((html.match(/v -11/g) ?? []).length, 3)
  }
})
