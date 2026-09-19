import { defineType, defineField } from 'sanity'

/** The physical artifact. This is the document that gets contradicted. */
export const printing = defineType({
  name: 'printing',
  title: 'Printing',
  type: 'document',
  fields: [
    defineField({ name: 'card', type: 'reference', to: [{ type: 'card' }], validation: (r) => r.required() }),
    defineField({ name: 'scryfallId', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'setCode', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'setName', type: 'string' }),
    defineField({ name: 'collectorNumber', type: 'string' }),
    defineField({ name: 'releasedAt', type: 'date' }),
    defineField({ name: 'originalText', type: 'text', rows: 6, description: 'Text as physically printed. COMPLETE.' }),
    defineField({ name: 'originalType', type: 'string' }),
    defineField({ name: 'imageUrl', type: 'url', description: 'Never crop, recolor or watermark. Artist credit required.' }),
    defineField({ name: 'artist', type: 'string' }),
    defineField({ name: 'joinMethod', type: 'string', description: 'scryfallId | setAndNumber | name (logged fallback)' }),
  ],
  preview: { select: { title: 'setCode', subtitle: 'originalText' } },
})
