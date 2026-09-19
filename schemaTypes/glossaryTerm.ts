import { defineType, defineField } from 'sanity'

export const glossaryTerm = defineType({
  name: 'glossaryTerm',
  title: 'Glossary term',
  type: 'document',
  fields: [
    defineField({ name: 'term', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'definition', type: 'text', rows: 4, validation: (r) => r.required() }),
    defineField({ name: 'rules', type: 'array', of: [{ type: 'reference', to: [{ type: 'ruleParagraph' }] }] }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'authoritySource' }], validation: (r) => r.required() }),
  ],
  preview: { select: { title: 'term', subtitle: 'definition' } },
})
