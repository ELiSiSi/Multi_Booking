export interface RecordAuditEventInput {
  bookingId?: string | null;
  actorId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditRepositoryPort {
  record(input: RecordAuditEventInput): Promise<void>;
}