import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware that validates request body/query/params against a Zod schema.
 * On success, replaces req.body/query with parsed (coerced + defaulted) values.
 * On failure, returns 400 with structured error details.
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = formatZodError(result.error);
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }
    // Replace with parsed/coerced data
    (req as any)[source] = result.data;
    next();
  };
}

function formatZodError(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    errors[path] = issue.message;
  }
  return errors;
}
