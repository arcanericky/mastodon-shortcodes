# Mastodon Shortcodes

A zero-dependency static web tool to browse custom emoji `:shortcodes:` on any Mastodon instance, copy them in one click, and see how shortcode character lengths count toward Mastodon's 500-character post limit.

**Live site:** [tootcodes.pages.dev](https://tootcodes.pages.dev)

## Features

- **Any Mastodon Server:** Pick from 10 popular preset instances or enter any Mastodon domain to fetch its public `/api/v1/custom_emojis` catalog directly in your browser.
- **Shareable Instance URLs:** Link directly to a specific server using `?instance=mastodon.world`.
- **Character Cost Awareness:** Shows the exact character cost of every `:shortcode:` (including colons) and includes a collapsible guide comparing custom shortcodes with 1-character Unicode emojis.
- **Fast on Large Servers:** Incrementally renders emojis in batches of 60 as you scroll so instances with thousands of custom emojis load smoothly without hitting media rate limits.
- **Search & Filter:** Instant client-side filtering by shortcode text and category, plus an **Include hidden** toggle that appears automatically when a server has unlisted (`visible_in_picker: false`) emojis.

## Local Preview

Serve the repository root with any static HTTP server:

```bash
python3 -m http.server 8081
```

Then open `http://localhost:8081`.

## Deploying on Cloudflare Pages

This site requires no build step or backend. Connect the repository to **Cloudflare Pages** with:

- **Framework preset:** `None`
- **Build command:** *(leave blank)*
- **Build output directory:** `/`
