import { defineType, defineField } from 'sanity'

/** Only paragraphs cited by a curated adjudication case are stored. */
export const ruleParagraph = defineType({
  name: 'ruleParagraph',
  title: 'Rule paragraph',
  type: 'document',
  fields: [
    defineField({
      name: 'number',
      type: 'string',
      description: 'Exact rule number, e.g. 108.1 or 509.1a',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'body', type: 'text', rows: 5, validation: (r) => r.required() }),
    defineField({ name: 'parentRule', type: 'reference', to: [{ type: 'ruleParagraph' }] }),
    defineField({ name: 'crVersion', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'effectiveFrom', type: 'date', validation: (r) => r.required() }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'authoritySource' }], validation: (r) => r.required() }),
  ],
  preview: { select: { title: 'number', subtitle: 'body' } },
})
