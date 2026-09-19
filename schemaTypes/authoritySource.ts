import { defineType, defineField } from 'sanity'

/** Every claim in the system traces back to one of these. */
export const authoritySource = defineType({
  name: 'authoritySource',
  title: 'Authority source',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'publisher', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'url', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'version', type: 'string', description: 'e.g. CR 2026-08-07' }),
    defineField({ name: 'publishedAt', type: 'date' }),
    defineField({ name: 'effectiveFrom', type: 'date' }),
    defineField({ name: 'retrievedAt', type: 'datetime', validation: (r) => r.required() }),
    defineField({ name: 'contentHash', type: 'string', description: 'sha256 of the retrieved bytes' }),
  ],
  preview: { select: { title: 'title', subtitle: 'version' } },
})
