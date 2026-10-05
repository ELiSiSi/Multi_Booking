import type { FastifyInstance } from 'fastify';

import {
  BusinessRepository,
  LocationRepository,
  ResourceRepository,
  ServiceRepository,
  ServiceResourceRepository,
} from './repositories/index.js';
import { buildBusinessRoutes } from './routes/business.routes.js';
import { buildLocationRoutes } from './routes/location.routes.js';
import { buildResourceRoutes } from './routes/resource.routes.js';
import { buildServiceRoutes } from './routes/service.routes.js';
import { buildServiceResourceRoutes } from './routes/service-resource.routes.js';
import {
  AssignResourceUseCase,
  CreateBusinessUseCase,
  CreateLocationUseCase,
  CreateResourceUseCase,
  CreateServiceUseCase,
  GetLocationUseCase,
  GetResourceUseCase,
  GetServiceUseCase,
  ListBusinessesUseCase,
  ListLocationsUseCase,
  ListResourcesUseCase,
  ListServiceResourcesUseCase,
  ListServicesUseCase,
  UnassignResourceUseCase,
  UpdateBusinessUseCase,
  UpdateLocationUseCase,
  UpdateResourceUseCase,
  UpdateServiceUseCase,
} from './use-cases/index.js';

export async function registerCatalogModule(
  app: FastifyInstance,
): Promise<void> {

  const businessRepository = new BusinessRepository();
  const locationRepository = new LocationRepository();
  const serviceRepository = new ServiceRepository();
  const resourceRepository = new ResourceRepository();
  const serviceResourceRepository = new ServiceResourceRepository();


  const createBusiness = new CreateBusinessUseCase(businessRepository);
  const updateBusiness = new UpdateBusinessUseCase(businessRepository);
  const listBusinesses = new ListBusinessesUseCase(businessRepository);


  const createLocation = new CreateLocationUseCase(
    businessRepository,
    locationRepository,
  );
  const updateLocation = new UpdateLocationUseCase(
    businessRepository,
    locationRepository,
  );
  const getLocation = new GetLocationUseCase(
    businessRepository,
    locationRepository,
  );
  const listLocations = new ListLocationsUseCase(
    businessRepository,
    locationRepository,
  );


  const createService = new CreateServiceUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
  );
  const updateService = new UpdateServiceUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
  );
  const getService = new GetServiceUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
  );
  const listServices = new ListServicesUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
  );


  const createResource = new CreateResourceUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
  );
  const updateResource = new UpdateResourceUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
  );
  const getResource = new GetResourceUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
  );
  const listResources = new ListResourcesUseCase(
    businessRepository,
    locationRepository,
    resourceRepository,
  );


  const assignResource = new AssignResourceUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
    resourceRepository,
    serviceResourceRepository,
  );
  const unassignResource = new UnassignResourceUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
    resourceRepository,
    serviceResourceRepository,
  );
  const listServiceResources = new ListServiceResourcesUseCase(
    businessRepository,
    locationRepository,
    serviceRepository,
    serviceResourceRepository,
  );


  await app.register(
    buildBusinessRoutes({
      createBusiness,
      updateBusiness,
      listBusinesses,
    }),
  );

  await app.register(
    buildLocationRoutes({
      createLocation,
      updateLocation,
      getLocation,
      listLocations,
    }),
  );

  await app.register(
    buildServiceRoutes({
      createService,
      updateService,
      getService,
      listServices,
    }),
  );

  await app.register(
    buildResourceRoutes({
      createResource,
      updateResource,
      getResource,
      listResources,
    }),
  );

  await app.register(
    buildServiceResourceRoutes({
      assignResource,
      unassignResource,
      listServiceResources,
    }),
  );
}