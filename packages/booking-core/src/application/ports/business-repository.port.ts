export interface PolicyBusinessView {
  id: string;
  ownerId: string;
  cancellationWindowMinutes: number;
}

export interface BusinessRepositoryPort {
  findById(id: string): Promise<PolicyBusinessView | null>;
}