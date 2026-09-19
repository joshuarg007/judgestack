import { defineType, defineField } from 'sanity'

/** The evaluation set, stored as content so the agent's own corpus defines the test. */
export const adjudicationCase = defineType({
  name: 'adjudicationCase',
  title: 'Adjudication case',
  type: 'document',
  fields: [
    defineField({ name: 'question', type: 'text', rows: 3, validation: (r) => r.required() }),
    defineField({ name: 'questionType', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'expectedVerdict', type: 'text', rows: 4, validation: (r) => r.required() }),
    defineField({ name: 'requiredRuleNumbers', type: 'array', of: [{ type: 'string' }] }),
    defineField({ name: 'requiredCards', type: 'array', of: [{ type: 'reference', to: [{ type: 'card' }] }] }),
    defineField({ name: 'effectiveDate', type: 'date' }),
    defineField({ name: 'holdout', type: 'boolean', initialValue: false, description: 'Excluded from prompt tuning' }),
    defineField({
      name: 'reviewState',
      type: 'string',
      options: { list: ['draft', 'verified'] },
      initialValue: 'draft',
    }),
  ],
  preview: { select: { title: 'question', subtitle: 'questionType' } },
})
