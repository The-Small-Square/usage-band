# usage-band

A Claude Code mod with three views of token use.

**Band above the prompt (session level):**

    ◔ 15%  ⧗ 52%  ▦ 51%  $ 4.10  ✎ 12                                   📈

Each figure is an icon and a value; hover one in the desktop app for a tooltip with its full
description (e.g. "5-hour limit: 52% used, resets in 53m (13:19)"). 📈 at the right end opens
the timeline. With more room the band
adds detail (`◔ 15% 152k/1M  ⧗ 52% ↻53m`), and with plenty it swaps the icons for captions
(`Context: 15% 152k/1M  5h: 52% ↻53m  Week: 51% ↻3d 3h  Session: $4.10  Prompts: 12`).

- ◔ Context: how full this session's context window is.
- ⧗ / ▦ 5-hour and weekly plan limits, ↻ time until each resets
  (on a Claude subscription; API-key sessions show the rest only).
- $ Session cost so far. ✎ Prompts measured.

**Per prompt:** each of your prompts in the transcript gets a small `ⓘ +15k` mark under it
(the context that prompt added). Hover it for a tooltip covering the prompt and its whole reply:
context before → after, tokens in (all requests, cached included) and out, cost, and how long it took.

**Timeline:** the 📈 icon, or `/usage-timeline`, opens a pane with a chart of how the
session's context grew prompt by prompt (bars: what each prompt added; red when it shrank, e.g.
after compaction) and a table of every prompt. Hover a point on the chart for a tooltip with that
prompt's text and figures. In a terminal the chart is a text sparkline.

Everything updates after each reply. Nothing is sent anywhere; history lives in the session and
starts when the mod first loads in it. A prompt sent twice with the same text shows the latest stats.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-band --marketplace The-Small-Square/usage-band
```

Answer `y` to add the marketplace, then press Enter to install for your user. Or from a shell:

```
claude plugin install usage-band --marketplace The-Small-Square/usage-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins,
Add marketplace with `The-Small-Square/usage-band`, then Add plugin. A mod installed from a
terminal for your user also loads in the desktop app's sessions.

### Updates

New versions are pushed to this repository. To get one:

```
claude plugin marketplace update usage-band
claude plugin update usage-band
```

or turn on auto-update for the `usage-band` marketplace in `/plugin` → Marketplaces, and new
versions install at startup. Restart the app (or start a new session) to load them.

## Install from a folder instead (no GitHub)

1. Unzip or clone so you have a folder `usage-band` (holding `.claude-plugin`, `hooks`, `types`),
   for example at `~/.claude/mods/usage-band`.
2. Add its full path to the `env` block of `~/.claude/settings.json`:

       "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<you>\\.claude\\mods\\usage-band" }

   (On macOS/Linux: `"/Users/<you>/.claude/mods/usage-band"`. If the variable already
   lists folders, add this one with `;` on Windows or `:` elsewhere.)
3. Quit and reopen the Claude desktop app (or start a new terminal session). Sessions started
   before the setting existed don't pick it up until then.

To remove it, delete that env entry and the folder.
