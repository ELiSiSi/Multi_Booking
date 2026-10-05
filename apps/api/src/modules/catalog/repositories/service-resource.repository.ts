import { prisma, type ServiceResource } from '@reservio/database';

export interface AssignServiceResourceInput {
  serviceId: string;
  resourceId: string;
}

export interface ListAssignmentsByServiceResult {
  items: ServiceResource[];
}

export interface ListAssignmentsByResourceResult {
  items: ServiceResource[];
}

export class ServiceResourceRepository {
  async findAssignment(
    serviceId: string,
    resourceId: string,
  ): Promise<ServiceResource | null> {
    return prisma.serviceResource.findUnique({
      where: {
        serviceId_resourceId: { serviceId, resourceId },
      },
    });
  }

  async assign(input: AssignServiceResourceInput): Promise<ServiceResource> {
    return prisma.serviceResource.create({
      data: {
        serviceId: input.serviceId,
        resourceId: input.resourceId,
      },
    });
  }

  async unassign(serviceId: string, resourceId: string): Promise<void> {
    await prisma.serviceResource.delete({
      where: {
        serviceId_resourceId: { serviceId, resourceId },
      },
    });
  }

  async listByService(serviceId: string): Promise<ServiceResource[]> {
    return prisma.serviceResource.findMany({
      where: { serviceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listByResource(resourceId: string): Promise<ServiceResource[]> {
    return prisma.serviceResource.findMany({
      where: { resourceId },
      orderBy: { createdAt: 'asc' },
    });
  }
}