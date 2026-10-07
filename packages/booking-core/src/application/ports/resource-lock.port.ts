export interface ResourceLockPort {
  lockResource(resourceId: string): Promise<void>;
}