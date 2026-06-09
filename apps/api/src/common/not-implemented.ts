import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Placeholder for endpoints whose contract is defined (PRD section 14) but
 * whose logic is delivered in a later iteration. Returns 501 so callers and
 * tests can distinguish "stubbed" from "broken".
 */
export function NotImplemented(operation: string): never {
  throw new HttpException(
    { statusCode: 501, message: `Not implemented: ${operation}` },
    HttpStatus.NOT_IMPLEMENTED,
  );
}
