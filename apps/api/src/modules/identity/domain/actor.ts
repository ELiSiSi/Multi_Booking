
export type Role = 'admin' | 'customer';

export interface Actor {
  userId: string;
  role: Role;
}
