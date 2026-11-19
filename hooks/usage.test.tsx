import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'usage-band',
  component: 'Pane',
  requestId: 'usage-timeline',
  props: {
    title: 'Token timeline',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('a prompt shows in the band and the timeline', async ($, on) => {
  let tokens = 10_000
  let usd = 0.5
  on('command.register', () => ({ value: { command: 'usage-timeline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens, window: 1_000_000, percent: Math.round(tokens / 10_000) },
      rateLimits: [{ kind: 'five_hour', percentUsed: 40 }],
      cost: { usd },
    },
  }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 19, 9, 30) }))
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: 'done' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'fix the login bug', origin: { kind: 'composer' } } as unknown as Parameters<typeof $.prompt.submit>[0])
  tokens = 25_000
  usd = 0.8
  await $.turn.complete({ answer: 'done', durationMs: 65_000, isAborted: false, turnId: 't1', reason: 'answer',
    usage: { model: 'm', input_tokens: 100, output_tokens: 2_000, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 4_900 } })

  for (const surface of ['terminal'] as const) {
    const bandProps = (bodyColumns: number) => ({ plugin: 'usage-band', component: 'AbovePrompt', surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 9 }, view: {} } }) as const

    // Wide: captions in place of the glyphs.
    const wide = await $.ui.mount(bandProps(140))
    expect((await wide.find({ type: 'Text', text: /^Context: / }))?.text).toBe('Context: 3% 25k/1M')
    expect((await wide.find({ type: 'Text', text: /^5h: / }))?.text).toBe('5h: 40%')
    expect((await wide.find({ type: 'Text', text: /^Session: / }))?.text).toBe('Session: $0.80')
    await wide.unmount()

    // Narrow: glyphs and values only.
    const narrow = await $.ui.mount(bandProps(30))
    expect((await narrow.find({ type: 'Text', text: /^◔/ }))?.text).toBe('◔ 3%')
    expect((await narrow.find({ type: 'Text', text: /^⧗/ }))?.text).toBe('⧗ 40%')
    expect(await narrow.find({ type: 'Text', text: /^Context: / })).toBeUndefined()
    await narrow.unmount()

    const row = await $.ui.mount({ plugin: 'usage-band', component: 'UserMessage', surface,
      props: { text: 'fix  the login bug', origin: { kind: 'composer' }, isExpanded: false } })
    expect((await row.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    expect((await row.find({ type: 'Text', text: /ⓘ/ }))?.text).toBe('ⓘ +15k')
    expect((await row.find({ type: 'Text', text: /Context/ }))?.text).toContain('10k → 25k (+15k)')
    expect((await row.find({ type: 'Text', text: /Cost/ }))?.text).toContain('$0.30')
    await row.unmount()

    const other = await $.ui.mount({ plugin: 'usage-band', component: 'UserMessage', surface,
      props: { text: 'something else', origin: { kind: 'composer' }, isExpanded: false } })
    expect(await other.find({ type: 'Text', text: /ⓘ/ })).toBeUndefined()
    await other.unmount()

    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: /fix the login bug/ }))?.text).toContain('+15k')
    await pane.unmount()
  }

  // Desktop: the figures are an Svg whose <title>s are the tooltips; the timeline icon stays a Button.
  const band = await $.ui.mount({ plugin: 'usage-band', component: 'AbovePrompt', surface: 'desktop',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 9 }, view: {} } })
  const svg = (await band.find({ type: 'Svg' }))?.props as { source: string } | undefined
  expect(svg?.source).toContain('<title>Context window: 25k of 1M tokens used (3%)</title>')
  expect(svg?.source).toContain('<title>5-hour limit: 40% used</title>')
  expect(svg?.source).toContain('Context: 3% 25k/1M')
  expect(await band.find({ type: 'Button', key: 'timeline' })).toBeDefined()
  await band.unmount()

  const row = await $.ui.mount({ plugin: 'usage-band', component: 'UserMessage', surface: 'desktop',
    props: { text: 'fix the login bug', origin: { kind: 'composer' }, isExpanded: false } })
  const mark = (await row.find({ type: 'Svg' }))?.props as { source: string } | undefined
  expect(mark?.source).toContain('ⓘ +15k')
  expect(mark?.source).toContain('Cost: $0.30')
  await row.unmount()

  // The timeline chart: drawn at the pane's width, each point's tooltip leads with its prompt.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const chart = (await pane.find({ type: 'Svg' }))?.props as { source: string; width: number } | undefined
  expect(chart?.width).toBe(792)
  expect(chart?.source).toContain('“fix the login bug”')
  expect(chart?.source).toContain('Context: 10k → 25k (+15k)')
  expect(chart?.source).toContain('font:13px')
  await pane.unmount()
})

test('the timeline zooms, pans and filters by time', async ($, on) => {
  let now = Date.UTC(2026, 10, 18, 8, 0)
  let tokens = 1_000
  on('command.register', () => ({ value: { command: 'usage-timeline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens, window: 1_000_000, percent: 1 }, rateLimits: [], cost: { usd: 1 } },
  }))
  on('clock.now', () => ({ value: now }))
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>engine</Text> })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', () => ({ text: 'done' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // 12 prompts, ten minutes apart; the last two within the final hour.
  for (let i = 1; i <= 12; i++) {
    await $.prompt.submit({ text: `prompt ${i}`, origin: { kind: 'composer' } } as unknown as Parameters<typeof $.prompt.submit>[0])
    tokens += 1_000
    now += 10 * 60_000
    await $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: `t${i}`, reason: 'answer' })
  }
  now += 41 * 60_000

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const range = async () => (await pane.find({ type: 'Text', text: /^Prompts / }))?.text ?? ''
  expect(await range()).toStartWith('Prompts 1–12 of 12')

  await pane.press({ key: 'zoom-in' })
  expect(await range()).toStartWith('Prompts 7–12 of 12')
  await pane.press({ key: 'pan-left' })
  expect(await range()).toStartWith('Prompts 4–9 of 12')
  await pane.press({ key: 'zoom-out' })
  expect(await range()).toStartWith('Prompts 1–12 of 12')
  await pane.press({ key: 'zoom-in' })
  await pane.press({ key: 'latest' })
  expect(await range()).toStartWith('Prompts 7–12 of 12')

  await pane.press({ key: 'range-1h' })
  expect(await range()).toStartWith('Prompts 1–2 of 2 in this period')
  expect((await pane.find({ type: 'Text', text: /prompt 12$/ }))?.text).toContain('+1k')
  expect(await pane.find({ type: 'Text', text: /prompt 3$/ })).toBeUndefined()
  await pane.press({ key: 'range-all' })
  expect(await range()).toStartWith('Prompts 1–12 of 12')
  await pane.unmount()
})
