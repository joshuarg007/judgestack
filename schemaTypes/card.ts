import { defineType, defineField } from 'sanity'

/**
 * Rulings are embedded rather than given their own document type.
 * They are always read in the context of their card, and separating
 * them would cost ~600 documents against the dataset budget.
 */
export const card = defineType({
  name: 'card',
  title: 'Card',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'oracleId', type: 'string', description: 'Scryfall oracle_id', validation: (r) => r.required() }),
    defineField({ name: 'oracleText', type: 'text', rows: 6, description: 'COMPLETE current Oracle text. Never truncate.' }),
    defineField({ name: 'typeLine', type: 'string' }),
    defineField({ name: 'manaCost', type: 'string' }),
    defineField({ name: 'currentAsOf', type: 'date', validation: (r) => r.required() }),
    defineField({
      name: 'rulings',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'body', type: 'text', rows: 3 },
            { name: 'publishedAt', type: 'date' },
            { name: 'source', type: 'string' },
          ],
          preview: { select: { title: 'body', subtitle: 'publishedAt' } },
        },
      ],
    }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'authoritySource' }], validation: (r) => r.required() }),
  ],
  preview: { select: { title: 'name', subtitle: 'typeLine' } },
})
