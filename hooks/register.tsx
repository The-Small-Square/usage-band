import { atom, read, update } from 'claude-code'
import type { Register, SessionUsage } from 'claude-code'

import type { TurnStat, Usage } from '../types'

const PANE = 'usage-timeline'
const usage = atom({ plugin: 'usage-band', key: 'usage' } as const, null)
const turns = atom({ plugin: 'usage-band', key: 'turns' } as const, [], { shape: 'turns-2' })

/** How a prompt row's text and a recorded prompt are compared. */
function promptKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 4000)
}

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'Week', spend_limit: 'Spend' }

function short(n: number): string {
  const a = Math.abs(n)
  const s = a >= 1_000_000 ? `${+(a / 1_000_000).toFixed(2)}M` : a >= 1_000 ? `${+(a / 1_000).toFixed(1)}k` : `${a}`
  return n < 0 ? `-${s}` : s
}

function signed(n: number): string {
  return n >= 0 ? `+${short(n)}` : short(n)
}

function money(usd: number): string {
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function span(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`
}

function clock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

function toUsage(u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): Usage {
  return {
    tokens: u.context.tokens,
    window: u.context.window,
    percent: u.context.percent,
    costUsd: u.cost?.usd,
    limits: u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
  }
}

/** The context after each prompt as a line, and what each prompt added as bars. */
const CHART_H = 360

/** One prompt's tooltip: the prompt itself first, then its figures. */
function pointTip(t: TurnStat, window: number): string {
  const text = (t.key || t.prompt).slice(0, 400)
  return [
    `${clock(t.at)}  “${text}${(t.key || t.prompt).length > 400 ? '…' : ''}”`,
    `Context: ${short(t.before)} → ${short(t.context)} (${signed(t.delta)})${window ? `, ${Math.round((t.context / window) * 100)}% of window` : ''}`,
    `Tokens: ${short(t.input)} in / ${short(t.output)} out`,
    `Cost: ${money(t.costUsd)} · took ${duration(t.durationMs)}`,
  ].join('\n')
}

/**
 * The context after each prompt as a line, and what each prompt added as bars, drawn at the
 * pane's own width so its text is never scaled down. Each prompt has a full-height hover column:
 * it lights the column and shows the prompt and its figures as a tooltip.
 */
function chartSvg(list: readonly TurnStat[], window: number, W: number): string {
  const H = CHART_H, L = 64, R = 20, T = 18, B = 56
  const top = Math.max(...list.map(t => t.context), 1) * 1.1
  const plot = W - L - R
  const x = (i: number) => L + (list.length === 1 ? plot / 2 : (i * plot) / (list.length - 1))
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const col = list.length === 1 ? plot : plot / (list.length - 1)
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(f => f * top)
    .map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
      `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${short(Math.round(v))}</text>`)
    .join('')
  const bw = Math.max(3, Math.min(22, col / 2))
  const line = list.map((t, i) => `${i ? 'L' : 'M'}${x(i)},${y(t.context)}`).join(' ')
  const points = list
    .map((t, i) => {
      const h = Math.abs(y(0) - y(Math.abs(t.delta)))
      return `<g class="pt"><title>${escape(pointTip(t, window))}</title>` +
        `<rect class="hit" x="${x(i) - col / 2}" y="${T}" width="${col}" height="${H - T - B}"/>` +
        `<line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"/>` +
        `<rect class="${t.delta >= 0 ? 'bar' : 'bar neg'}" x="${x(i) - bw / 2}" y="${y(0) - h}" width="${bw}" height="${h}"/>` +
        `<circle class="dot" cx="${x(i)}" cy="${y(t.context)}" r="4"/></g>`
    })
    .join('')
  const step = Math.max(1, Math.ceil(list.length / Math.max(2, Math.floor(plot / 70))))
  const xs = list
    .map((t, i) => (i % step === 0 || i === list.length - 1
      ? `<text x="${x(i)}" y="${H - B + 20}" text-anchor="middle">${clock(t.at)}</text>` : ''))
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<style>text{font:13px system-ui,-apple-system,"Segoe UI",sans-serif;fill:#9a9a9a}` +
    `.grid{stroke:#8883}.hit{fill:transparent}.guide{stroke:#3b82f6;stroke-width:1;opacity:0}` +
    `.bar{fill:#f59e0b88}.bar.neg{fill:#ef444488}.dot{fill:#3b82f6;stroke:#fff0;stroke-width:3}` +
    `.pt{cursor:default}.pt:hover .hit{fill:#8881}.pt:hover .guide{opacity:.6}` +
    `.pt:hover .dot{r:7;stroke:#3b82f655}.pt:hover .bar{fill:#f59e0b}.pt:hover .bar.neg{fill:#ef4444}</style>` +
    grid + `<path d="${line}" fill="none" stroke="#3b82f6" stroke-width="2.5" pointer-events="none"/>` + points + xs +
    `<text x="${L}" y="${H - 10}">Line: context after each prompt · Bars: what that prompt added (red: shrank) · Hover a point for its prompt</text></svg>`
}

function sparkline(list: readonly TurnStat[]): string {
  const blocks = '▁▂▃▄▅▆▇█'
  const top = Math.max(...list.map(t => t.context), 1)
  return list.map(t => blocks[Math.min(7, Math.floor((t.context / top) * 7.999))]).join('')
}

/** One figure of the band: its glyph, its value, the caption shown when there is room, and its tooltip. */
/** `captionValue` replaces `value` where the caption stands in for the glyph (the cost's `$`, which the glyph otherwise says). */
type BandItem = { id: string; icon: string; caption: string; value: string; captionValue?: string; extra: string; tip: string }

function bandItems(u: Usage, prompts: number, now: number): BandItem[] {
  const items: BandItem[] = [{
    id: 'ctx',
    icon: '◔',
    caption: 'Context',
    value: u.tokens === undefined ? `—/${short(u.window)}` : `${u.percent ?? 0}%`,
    extra: u.tokens === undefined ? '' : ` ${short(u.tokens)}/${short(u.window)}`,
    tip: u.tokens === undefined
      ? `Context window: ${short(u.window)} tokens, not measured yet`
      : `Context window: ${short(u.tokens)} of ${short(u.window)} tokens used (${u.percent ?? 0}%)`,
  }]
  for (const l of u.limits) {
    const reset = span(l.resetsAt, now)
    const name = l.kind === 'five_hour' ? '5-hour limit' : l.kind === 'seven_day' ? 'Weekly limit' : `${LABELS[l.kind] ?? l.kind} limit`
    items.push({
      id: l.kind,
      icon: l.kind === 'five_hour' ? '⧗' : l.kind === 'seven_day' ? '▦' : '◈',
      caption: LABELS[l.kind] ?? l.kind,
      value: `${l.percentUsed}%`,
      extra: reset ? ` ↻${reset}` : '',
      tip: `${name}: ${l.percentUsed}% used${reset ? `, resets in ${reset}${l.resetsAt ? ` (${clock(Date.parse(l.resetsAt))})` : ''}` : ''}`,
    })
  }
  if (u.costUsd !== undefined) {
    items.push({ id: 'cost', icon: '$', caption: 'Session', value: u.costUsd.toFixed(2), captionValue: `$${u.costUsd.toFixed(2)}`, extra: '', tip: `This session has cost ${money(u.costUsd)} so far` })
  }
  if (prompts) {
    items.push({ id: 'prompts', icon: '✎', caption: 'Prompts', value: `${prompts}`, extra: '', tip: `${prompts} prompt${prompts === 1 ? '' : 's'} measured in this session; hover ⓘ under a prompt for its own figures` })
  }
  return items
}

/** 0: glyph and value. 1: adds the detail (tokens, reset time). 2: the caption in place of the glyph. */
function label(item: BandItem, tier: 0 | 1 | 2): string {
  if (tier === 2) return `${item.caption}: ${item.captionValue ?? item.value}${item.extra}`
  return `${item.icon} ${item.value}${tier === 1 ? item.extra : ''}`
}

/** A row of text chips, each with a native tooltip (`<title>`), lit on hover. */
const CHIP_H = 20

/** The chips' drawn width in CSS pixels, to size the Svg's frame exactly. */
function chipsWidth(chips: readonly { text: string }[]): number {
  return Math.max(1, Math.ceil(chips.reduce((n, c) => n + Math.ceil(c.text.length * 7.2) + 16, 0) - 16 + 6))
}

function chipsSvg(chips: readonly { text: string; tip: string }[]): string {
  const CH = 7.2, GAP = 16, H = CHIP_H
  let x = 0
  const parts = chips.map(c => {
    const w = Math.ceil(c.text.length * CH)
    const g = `<g class="c"><title>${escape(c.tip)}</title>` +
      `<rect x="${x - 4}" y="1" width="${w + 8}" height="${H - 2}" rx="5" fill="transparent"/>` +
      `<text x="${x}" y="14">${escape(c.text)}</text></g>`
    x += w + GAP
    return g
  })
  const W = Math.max(1, Math.ceil(x - GAP + 6))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<style>text{font:12px system-ui,-apple-system,"Segoe UI",sans-serif;fill:#8a8a8a}` +
    `.c{cursor:default}.c:hover rect{fill:#8a8a8a26}.c:hover text{fill:#3b82f6}</style>` +
    parts.join('') + `</svg>`
}

function width(items: readonly BandItem[], tier: 0 | 1 | 2): number {
  return items.reduce((n, it) => n + label(it, tier).length + 2, 0)
}

export const register: Register = on => {
  let pending: { key: string; prompt: string; startCost: number; startContext: number } | null = null

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'usage-timeline', description: "Show how this session's tokens grew, prompt by prompt" })
    const u = await $.session.usage()
    await update($, usage, () => toUsage(u))
    return result
  })

  on('command.run', { command: 'usage-timeline' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Token timeline' })
    return { text: 'Token timeline opened.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      const u = await $.session.usage()
      const key = promptKey(e.text)
      pending = {
        key,
        prompt: key.slice(0, 80),
        startCost: u.cost?.usd ?? 0,
        startContext: u.context.tokens ?? 0,
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const u = await $.session.usage()
    await update($, usage, () => toUsage(u))
    const list = await read($, turns)
    const prev = list.at(-1)?.context ?? pending?.startContext ?? 0
    const context = u.context.tokens ?? prev
    const costNow = u.cost?.usd ?? 0
    const stat: TurnStat = {
      at: await $.clock.now(),
      key: pending?.key ?? '',
      prompt: pending?.prompt ?? '(background event)',
      before: prev,
      context,
      delta: context - prev,
      input: (e.usage?.input_tokens ?? 0) + (e.usage?.cache_read_input_tokens ?? 0) + (e.usage?.cache_creation_input_tokens ?? 0),
      output: e.usage?.output_tokens ?? 0,
      costUsd: Math.max(0, costNow - (pending?.startCost ?? costNow)),
      durationMs: e.durationMs,
    }
    pending = null
    await update($, turns, l => [...l, stat].slice(-500))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = await read($, usage)
    if (e.props.hasSurvey || u === null) return next(e)

    const now = await $.clock.now()
    const prompts = (await read($, turns)).length
    const items = bandItems(u, prompts, now)
    // Widest form that fits, leaving room for the Timeline button.
    const room = e.props.bodyColumns - 6
    const tier = ([2, 1, 0] as const).find(t => width(items, t) <= room) ?? 0
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const timeline = (
      <Button key="timeline" plain dimColor label="📈" onPress={() => void $.ui.open({ id: PANE, title: 'Token timeline' })} />
    )

    // Desktop, VS Code and mobile draw an Svg, whose <title>s are real hover tooltips.
    if (e.surface !== 'terminal' && 'Svg' in els) {
      const chips = items.map(it => ({ text: label(it, tier), tip: it.tip }))
      return (
        <Box flexDirection="row" alignItems="center">
          <els.Svg source={chipsSvg(chips)} alt={items.map(it => it.tip).join('. ')} width={chipsWidth(chips)} height={CHIP_H} isInteractive />
          <Box flexGrow={1} />
          {timeline}
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={2}>
        {items.map(item => (
          <Text key={item.id} dimColor wrap="truncate">{label(item, tier)}</Text>
        ))}
        <Box flexGrow={1} />
        {timeline}
      </Box>
    )
  })

  // Each prompt row gets a small icon; hovering it shows what that prompt and its reply cost.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const row = await next(e)
    if (e.props.task || e.props.from) return row
    const key = promptKey(e.props.text)
    const stat = (await read($, turns)).findLast(t => t.key === key)
    if (!stat) return row
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const window = (await read($, usage))?.window ?? 0
    const lines: [string, string][] = [
      ['Context', `${short(stat.before)} → ${short(stat.context)} (${signed(stat.delta)})${window ? `, ${Math.round((stat.context / window) * 100)}% of window` : ''}`],
      ['Tokens in', `${short(stat.input)} (all requests, cached included)`],
      ['Tokens out', short(stat.output)],
      ['Cost', money(stat.costUsd)],
      ['Took', `${duration(stat.durationMs)}, finished ${clock(stat.at)}`],
    ]

    if (e.surface !== 'terminal' && 'Svg' in els) {
      const tip = ['This prompt and its reply', ...lines.map(([l, v]) => `${l}: ${v}`)].join('\n')
      return (
        <Box flexDirection="column">
          {row}
          <Box flexDirection="row" justifyContent="flex-end">
            <els.Svg source={chipsSvg([{ text: `ⓘ ${signed(stat.delta)}`, tip }])} alt={tip} width={chipsWidth([{ text: `ⓘ ${signed(stat.delta)}` }])} height={CHIP_H} isInteractive />
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="row" justifyContent="flex-end">
          <Box key={`usage-${stat.at}`}>
            <Text dimColor hover={{ dimColor: false }}>{`ⓘ ${signed(stat.delta)}`}</Text>
            <Box
              position="absolute"
              bottom={1}
              right={0}
              display="none"
              hover={{ display: 'flex' }}
              flexDirection="column"
              borderStyle="round"
              paddingX={1}
              backgroundColor="background"
              width={52}
            >
              <Text bold>This prompt and its reply</Text>
              {lines.map(([label, value]) => (
                <Text key={label} wrap="truncate">
                  <Text dimColor>{label.padEnd(11)}</Text>
                  {value}
                </Text>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const list = await read($, turns)
    if (list.length === 0) {
      return <Text dimColor>No prompts measured yet. The timeline fills in after each reply.</Text>
    }
    const u = await read($, usage)
    const window = u?.window ?? 200_000
    const lastCtx = list.at(-1)?.context ?? 0
    const total = list.reduce(
      (s, t) => ({ input: s.input + t.input, output: s.output + t.output, cost: s.cost + t.costUsd }),
      { input: 0, output: 0, cost: 0 },
    )
    const rows = list.slice(-Math.max(5, (e.viewport?.rows ?? 40) - 20)).reverse()
    // The pane's width in CSS pixels (about 8 per column), so the chart is drawn 1:1 and its text stays readable.
    const chartW = Math.max(420, Math.min(1600, Math.round((e.props.bodyColumns ?? 90) * 8) - 8))
    const chart = e.surface !== 'terminal' && 'Svg' in els
      ? <els.Svg source={chartSvg(list, window, chartW)} alt={`Context grew to ${short(lastCtx)} tokens over ${list.length} prompts`} width={chartW} height={CHART_H} isInteractive />
      : <Text>{sparkline(list)}</Text>

    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          {`${list.length} prompts · context now ${short(lastCtx)} of ${short(window)} · ${short(total.input)} in / ${short(total.output)} out · ${money(total.cost)}`}
        </Text>
        {chart}
        <Box flexDirection="column">
          <Text bold>{'Time   Context    Change  In / out          Cost    Took  Prompt'}</Text>
          {rows.map(t => (
            <Text key={String(t.at)} wrap="truncate">
              {`${clock(t.at)}  ${short(t.context).padStart(7)}  ${signed(t.delta).padStart(8)}  ${`${short(t.input)} / ${short(t.output)}`.padEnd(15)}  ${money(t.costUsd).padStart(6)}  ${duration(t.durationMs).padStart(6)}  ${t.prompt}`}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
