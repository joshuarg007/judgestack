import { defineType, defineField } from 'sanity'

/** A dated assertion extracted from ONE source. Machine-generated. Never a verdict. */
export const claim = defineType({
  name: 'claim',
  title: 'Claim',
  type: 'document',
  fields: [
    defineField({ name: 'statement', type: 'text', rows: 4, validation: (r) => r.required() }),
    defineField({
      name: 'kind',
      type: 'string',
      options: { list: ['oracleWording', 'printedWording', 'ruleText', 'ruling', 'legality'] },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'subjectCard', type: 'reference', to: [{ type: 'card' }] }),
    defineField({ name: 'effectiveFrom', type: 'date' }),
    defineField({ name: 'effectiveTo', type: 'date' }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'authoritySource' }], validation: (r) => r.required() }),
  ],
  preview: { select: { title: 'statement', subtitle: 'kind' } },
})
