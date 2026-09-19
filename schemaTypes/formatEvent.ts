import { defineType, defineField } from 'sanity'

/** Legality is a timeline of dated events, not a boolean. */
export const formatEvent = defineType({
  name: 'formatEvent',
  title: 'Format event',
  type: 'document',
  fields: [
    defineField({ name: 'card', type: 'reference', to: [{ type: 'card' }], validation: (r) => r.required() }),
    defineField({ name: 'format', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ['legal', 'banned', 'restricted', 'not_legal'] },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'effectiveFrom', type: 'date', validation: (r) => r.required() }),
    defineField({ name: 'announcementUrl', type: 'url' }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'authoritySource' }] }),
  ],
  preview: { select: { title: 'format', subtitle: 'status' } },
})
