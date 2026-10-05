import { decodeCursor } from '../repositories/_cursor.js';
import { InvalidCursorError } from './catalog.errors.js';

export function assertValidCursor(cursor?: string): void {
  if (cursor === undefined) return;

  const decoded = decodeCursor(cursor);
  if (decoded === null) {
    throw new InvalidCursorError();
  }
}