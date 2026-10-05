export interface CursorData {
  createdAt: string;
  id: string;
}

export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as CursorData).createdAt === 'string' &&
      typeof (parsed as CursorData).id === 'string'
    ) {
      return parsed as CursorData;
    }

    return null;
  } catch {
    return null;
  }
}