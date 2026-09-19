import { defineType, defineField } from 'sanity'

/** Human-reviewed. This is what the agent is allowed to present as a verdict. */
export const decision = defineType({
  name: 'decision',
  title: 'Decision',
  type: 'document',
  fields: [
    defineField({
      name: 'questionType',
      type: 'string',
      options: {
        list: [
          { title: 'What does this card say now?', value: 'currentWording' },
          { title: 'How does it interact with the rules?', value: 'interaction' },
          { title: 'What did it do on an earlier date?', value: 'historical' },
          { title: 'Is it legal in this format?', value: 'legality' },
          { title: 'Why does my card say something different?', value: 'printedVsOracle' },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'claims', type: 'array', of: [{ type: 'reference', to: [{ type: 'claim' }] }], validation: (r) => r.min(2) }),
    defineField({ name: 'resolution', type: 'text', rows: 4, validation: (r) => r.required() }),
    defineField({ name: 'supportingRule', type: 'reference', to: [{ type: 'ruleParagraph' }] }),
    defineField({ name: 'appliesFrom', type: 'date' }),
    defineField({ name: 'appliesTo', type: 'date' }),
    defineField({
      name: 'reviewMethod',
      type: 'string',
      options: { list: ['human', 'model-assisted'] },
      initialValue: 'human',
      description: 'model-assisted decisions are drafts awaiting human confirmation and must be labelled as such in any writeup',
    }),
    defineField({ name: 'confirmedByHuman', type: 'boolean', initialValue: false }),
    defineField({ name: 'reviewedBy', type: 'string' }),
    defineField({ name: 'reviewedAt', type: 'datetime' }),
  ],
  preview: { select: { title: 'resolution', subtitle: 'questionType' } },
})
