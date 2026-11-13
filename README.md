# Mastodon Shortcodes

A zero-dependency static web tool to browse custom emoji `:shortcodes:` on any Mastodon instance, copy them in one click, and see how shortcode character lengths count toward Mastodon's 500-character post limit.

## Features

- **Any Mastodon Server:** Pick from 10 popular preset instances or enter any Mastodon domain to fetch its public `/api/v1/custom_emojis` catalog directly in the browser.
- **Character Cost Awareness:** Displays the exact character cost of every `:shortcode:` (including colons) and includes an interactive Guide & Sandbox for comparing custom shortcodes with 1-character Unicode emojis.
- **Fast on Large Servers:** Incrementally renders emojis in batches of 60 as you scroll so instances with thousands of custom emojis load smoothly without hitting media rate limits.
- **Search & Filter:** Instant client-side filtering by shortcode text, category, and picker visibility (`visible_in_picker`).

## Local Preview

Serve the repository root with any static HTTP server:

```bash
python3 -m http.server 8081
```

Then open `http://localhost:8081`.

## Deploying on Cloudflare Pages

Connect this repository to **Cloudflare Pages** with:
- **Framework preset:** `None`
- **Build command:** *(leave blank)*
- **Build output directory:** `/`
