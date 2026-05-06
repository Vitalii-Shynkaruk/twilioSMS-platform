import { describe, expect, it } from 'vitest';
import { createTemplateSchema, updateTemplateSchema } from '../src/validation/schemas';

describe('Валидация SMS template payload', () => {
  it('должна принимать null category при обновлении шаблона', () => {
    const result = updateTemplateSchema.safeParse({
      name: 'Email sent',
      body: 'Email sent came from Marcos Cruz.',
      category: null,
    });

    expect(result.success).toBe(true);
  });

  it('должна принимать null category при создании шаблона', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Email sent',
      body: 'Email sent came from Marcos Cruz.',
      category: null,
      visibility: 'PRIVATE',
    });

    expect(result.success).toBe(true);
  });
});
