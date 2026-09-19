import { defineType, defineField } from 'sanity'

/**
 * Machine-detected only. Carries NO verdict.
 * Text similarity does not indicate functional change:
 * Benalish Hero is 2% similar and functionally identical,
 * Lightning Bolt is highly similar and functionally different.
 */
export const textDifference = defineType({
  name: 'textDifference',
  title: 'Text difference',
  type: 'document',
  fields: [
    defineField({ name: 'card', type: 'reference', to: [{ type: 'card' }], validation: (r) => r.required() }),
    defineField({ name: 'printing', type: 'reference', to: [{ type: 'printing' }], validation: (r) => r.required() }),
    defineField({ name: 'similarity', type: 'number' }),
    defineField({ name: 'detectedAt', type: 'datetime' }),
    defineField({
      name: 'reviewState',
      type: 'string',
      options: { list: ['unreviewed', 'functional', 'nonfunctional', 'uncertain'] },
      initialValue: 'unreviewed',
    }),
  ],
})
