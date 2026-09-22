'use client'
import { useEffect, useRef, useState } from 'react'

type Quote = { label: string; text: string; complete: boolean }
type Typed = {
  questionType: string
  verdict: string
  enoughEvidence: boolean
  missing: string
  reasoning: string
  governingAuthority: string
  quotations: Quote[]
  ruleCitations: { number: string; text: string }[]
  conflict: { present: boolean; explanation: string }
}
type Printing = {
  _id: string; setName: string; setCode: string; releasedAt: string
  imageUrl: string; artist: string; originalText: string; card: string
}
type Result = {
  answer: string; typed: Typed | null; typedError: string | null
  model: string; retrieval: string; latencyMs: number
  toolCalls: string[]; retrievedIds: string[]; retrievedRuleNumbers: string[]
  unsupportedCitations: string[]
}

const QUESTION_TYPES: Record<string, string> = {
  currentWording: 'What does this card say now?',
  interaction: 'How does this work with the rules?',
  historical: 'What did this do in an earlier year?',
  legality: 'Can I play this in that format?',
  printedVsOracle: 'Why does my card say something different?',
  unclear: 'Could not classify the question',
}

const SAMPLES = [
  { short: 'Why does my old card say something different?', full: 'My Alpha copy of Word of Command says I choose a card my opponent can legally play. What does it actually do now?' },
  { short: 'Did the rules change, or did the card change?', full: 'Can Mogg Fanatic assign combat damage, sacrifice itself, and still deal that damage?' },
  { short: 'Can I play this card in my format?', full: 'Can I register four copies of The Fantasticar in Legacy and Vintage today?' },
]

export default function Page() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [printings, setPrintings] = useState<Printing[]>([])
  const [asked, setAsked] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(0)

  // Live elapsed time while a question is in flight. Structured retrieval makes a
  // dozen or so tool calls, so the wait is long enough that a silent page looks
  // broken. Once the answer lands the server's own latencyMs replaces this, since
  // that is the number the evaluation records and this one also covers the
  // follow-up printings fetch.
  useEffect(() => {
    if (!loading) return
    startedAt.current = performance.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 50)
    return () => clearInterval(id)
  }, [loading])

  async function ask(question: string) {
    setLoading(true); setErr(null); setRes(null); setPrintings([]); setQ(question); setAsked(question)
    try {
      const r = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
      setRes(data)
      if (data.retrievedIds?.length) {
        const pr = await fetch('/api/cards', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: data.retrievedIds }),
        })
        if (pr.ok) setPrintings((await pr.json()).printings ?? [])
      }
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }

  const t = res?.typed

  const secs = (ms: number) => (ms / 1000).toFixed(1)

  return (
    <main className="wrap">
      <div className={`timer${loading ? ' timer-live' : ''}`} role="status" aria-live="polite">
        <span className="timer-value">{secs(loading ? elapsed : (res?.latencyMs ?? 0))}s</span>
        <span className="timer-label">
          {loading ? 'retrieving' : res ? `${res.toolCalls?.length ?? 0} tool calls` : 'ready'}
        </span>
      </div>
      <header>
        <h1>JudgeStack</h1>
        <p className="tagline">Magic: The Gathering rules answers, with the sources that support them.</p>
        <p className="explainer">
          The words printed on an older Magic card may no longer match its current official wording,
          called <strong>Oracle text</strong>. The game&rsquo;s rules can also change over time, and each
          format has its own list of cards that are allowed, banned, or restricted.
        </p>
        <p className="explainer">Ask JudgeStack a question and it will explain:</p>
        <ul className="explainer-list">
          <li>What the card currently does</li>
          <li>Which rule applies</li>
          <li>Whether the card is legal in your format</li>
          <li>Which source controls the answer</li>
        </ul>
      </header>

      <section aria-label="Ask a question">
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q) }}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Ask a question" aria-label="Rules question" />
          <button type="submit" disabled={loading || !q.trim()}>{loading ? 'Working...' : 'Ask'}</button>
        </form>

        <p className="try">Or try one of these:</p>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s.short} type="button" onClick={() => ask(s.full)} disabled={loading} title={s.full}>
              {s.short}
            </button>
          ))}
        </div>
      </section>

      {asked && (
        <section className="asked" aria-label="Question asked">
          <p className="asked-label">Question</p>
          <p className="asked-text">{asked}</p>
        </section>
      )}

      {loading && (
        <div className="card status">
          <p>Searching the rules, the card records and the format lists, then checking which one governs.</p>
          <p className="meta">Running on a local model, so this takes a while.</p>
        </div>
      )}

      {err && (
        <div className="card panel-warn">
          <h2>Could not answer</h2>
          <p className="err">{err}</p>
          <p className="meta">Nothing is shown when retrieval fails. No cached or invented answer is substituted.</p>
        </div>
      )}

      {res && (
        <article aria-label="Answer">
          {t ? (
            <>
              <div className={`card verdict-card ${t.enoughEvidence ? '' : 'panel-warn'}`}>
                <h2>{t.enoughEvidence ? 'Answer' : 'Not enough evidence'}</h2>
                <p className="verdict">{t.verdict}</p>
                {!t.enoughEvidence && t.missing && (
                  <p className="missing"><strong>What is missing:</strong> {t.missing}</p>
                )}
                <p className="qtype">Read as: {QUESTION_TYPES[t.questionType] ?? t.questionType}</p>
              </div>

              {t.reasoning && (
                <div className="card">
                  <h2>Why</h2>
                  <p>{t.reasoning}</p>
                </div>
              )}

              {t.governingAuthority && (
                <div className="card accent-card">
                  <h2>Which source decided this</h2>
                  <p>{t.governingAuthority}</p>
                  <p className="meta">Different questions are governed by different authorities. The Oracle
                    reference settles wording, the Comprehensive Rules settle interactions, and a dated
                    announcement settles legality.</p>
                </div>
              )}

              {t.conflict?.present && (
                <div className="card panel-conflict">
                  <h2>These sources disagree</h2>
                  <p>{t.conflict.explanation}</p>
                </div>
              )}

              {t.quotations?.length > 0 && (
                <div className="card">
                  <h2>Exact wording</h2>
                  {t.quotations.map((qq, i) => (
                    <figure key={i} className="quote">
                      <figcaption>{qq.label}{qq.complete ? '' : ' (excerpt)'}</figcaption>
                      <blockquote>{qq.text}</blockquote>
                    </figure>
                  ))}
                </div>
              )}

              {t.ruleCitations?.length > 0 && (
                <div className="card">
                  <h2>Rules cited</h2>
                  {t.ruleCitations.map((r) => (
                    <figure key={r.number} className="quote">
                      <figcaption>Comprehensive Rules {r.number}</figcaption>
                      <blockquote>{r.text}</blockquote>
                    </figure>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="card panel-warn">
              <h2>Unstructured answer</h2>
              <p className="meta">Could not format this into the standard shape{res.typedError ? `: ${res.typedError}` : ''}. Showing the raw text.</p>
              <p className="answer">{res.answer}</p>
            </div>
          )}

          {printings.length > 0 && (
            <div className="card">
              <h2>The cards involved</h2>
              <div className="printings">
                {printings.map((p) => (
                  <figure key={p._id} className="printing">
                    {/* Whole card, uncropped and unaltered, artist credited. */}
                    <img src={p.imageUrl} alt={`${p.card}, ${p.setName} printing`} loading="lazy" />
                    <figcaption>
                      {p.setName} ({p.releasedAt?.slice(0, 4)})<br />
                      <span className="artist">Illustrated by {p.artist}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {res.unsupportedCitations.length > 0 && (
            <div className="card panel-warn">
              <h2>Unverified citations</h2>
              <p>This answer cites {res.unsupportedCitations.join(', ')}, which {res.unsupportedCitations.length === 1 ? 'was' : 'were'} not
                found in anything retrieved. Treat as unsupported.</p>
            </div>
          )}

          <details className="card" open={showDetail} onToggle={(e) => setShowDetail((e.target as HTMLDetailsElement).open)}>
            <summary>How this answer was produced</summary>
            <div className="meta">
              model <code>{res.model}</code><br />
              retrieval <code>{res.retrieval}</code><br />
              searches run <code>{res.toolCalls.length}</code><br />
              rules found <code>{res.retrievedRuleNumbers.join(', ') || 'none'}</code><br />
              documents read <code>{res.retrievedIds.length}</code><br />
              took <code>{(res.latencyMs / 1000).toFixed(1)}s</code>
            </div>
          </details>
        </article>
      )}

      <footer>
        <p>
          Card text and images are copyright Wizards of the Coast. Images are shown whole and unaltered
          with artist credit, per the{' '}
          <a href="https://company.wizards.com/en/legal/fancontentpolicy">Fan Content Policy</a>. Card data
          is provided by <a href="https://scryfall.com/">Scryfall</a> and{' '}
          <a href="https://mtgjson.com/">MTGJSON</a>.
        </p>
        <p>
          Unofficial Fan Content. Not approved or endorsed by Wizards. Portions of the materials used are
          property of Wizards of the Coast.
        </p>
      </footer>
    </main>
  )
}
