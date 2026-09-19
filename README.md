# JudgeStack

An agent that answers Magic: The Gathering rules questions by reconstructing the
authority chain behind the answer: current Oracle wording, the applicable rule,
dated official rulings, format announcements, and the older printing that may be
misleading you.

Entry for the DEV x Sanity Challenge, Path One. Submissions close 4 Oct 2026.

## Why this needs structured content

There is no single precedence ladder in Magic. CR 108.1 says to use the Oracle
card reference when determining a card's wording. CR 101.1 says a card's text
takes precedence where it directly contradicts a general rule. So the governing
authority depends on what is being asked:

| Question | Governing authority |
| --- | --- |
| What does this card say now? | Current Oracle wording (CR 108.1) |
| How does it interact with the rules? | Oracle plus current CR; CR 101.1 where the card overrides |
| What did it do in an earlier year? | Rules and Oracle wording effective on that date |
| Is it legal in this format? | The format announcement and its effective date |
| Why does my card say something different? | Printed wording vs current Oracle wording |

## Scope

A curated rules laboratory, not a replacement for a certified judge.

Two separate limits:
- whole dataset under 8,000 documents (Free-tier cap is 10,000)
- Knowledge Base query set under 5,000 documents (per-source match limit)

`npm run budget` fails if either drifts.

## Licensing

Three distinct obligations:
- MTGJSON's compilation is MIT licensed.
- Scryfall's API terms: accurate `User-Agent` and `Accept` headers, bulk files over
  per-card calls, and strict image rules (no cropping, recoloring, watermarking, or
  clipping the copyright line; credit the artist).
- The underlying Magic text and artwork fall under the Wizards
  [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy), which
  excludes "the verbatim copying and reposting of Wizards' IP".

Because of that last point the **complete Comprehensive Rules are never stored as
dataset documents**. `ingest-rules.ts` saves the file to `data/raw/` (gitignored) for
upload to the Knowledge Base as a file source, and stores only the paragraphs an
adjudication case actually cites, so citations can be verified exactly.

Unofficial Fan Content permitted under the Fan Content Policy. Not approved or
endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast.

## Setup

    cp .env.example .env     # then fill it in
    npm install
    npm run schema:deploy

## Pipeline

    npm run ingest:rules        # KB file source + allowlisted rule paragraphs
    npm run ingest:cards        # curated cards, rulings embedded
    npm run ingest:printings    # MTGJSON originalText, joined by scryfallOracleId
    npm run ingest:bans         # dated legality events
    npm run detect:differences  # textDifference records, no verdicts
    npm run budget              # fails if over budget

## The gate

    npm run slice

One identical prompt through both Context endpoints. Three criteria are checked
automatically; four need a human. On a pass, go to the 30-question evaluation,
not another planning revision.
