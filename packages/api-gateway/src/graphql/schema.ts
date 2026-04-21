/**
 * Minimal GraphQL schema for signal queries.
 * Uses graphql-yoga for Fastify integration.
 */

import { createSchema } from 'graphql-yoga';
import type { SignalId, ProjectId, Pagination, SignalStatus } from '@connectedicd/shared-types';
import type { SignalService, SignalFilter } from '@connectedicd/core-services';

export interface GraphQLDeps {
  signalService: SignalService;
}

const typeDefs = /* GraphQL */ `
  type LogicalLayer {
    id: ID!
    signalId: ID!
    dataType: String
    minValue: Float
    maxValue: Float
    units: String
    description: String
    sourceSystem: String
    destSystem: String
    refreshRateHz: Float
    functionalCategory: String
  }

  type TransportLayer {
    id: ID!
    signalId: ID!
    protocolId: ID
    busId: ID
    protocolAttrs: String
    bitOffset: Int
    bitLength: Int
    encoding: String
    scaleFactor: Float
    offsetValue: Float
    byteOrder: String
  }

  type PhysicalLayer {
    id: ID!
    signalId: ID!
    connectorId: ID
    pinNumber: String
    cableBundleId: ID
    wireGauge: String
    wireColor: String
    wireType: String
    maxLengthM: Float
    shielding: String
  }

  type Signal {
    id: ID!
    name: String!
    projectId: ID!
    status: String
    criticality: String
    createdAt: String
    updatedAt: String
    logical: LogicalLayer
    transport: TransportLayer
    physical: PhysicalLayer
  }

  type PaginatedSignals {
    data: [Signal!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
  }

  type Query {
    signal(id: ID!): Signal
    signals(
      projectId: ID
      name: String
      status: String
      page: Int
      pageSize: Int
    ): PaginatedSignals!
  }
`;

export function createGraphQLSchema(deps: GraphQLDeps) {
  const { signalService } = deps;

  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        signal: async (_: unknown, args: { id: string }) => {
          return signalService.getSignal(args.id as SignalId);
        },
        signals: async (
          _: unknown,
          args: {
            projectId?: string;
            name?: string;
            status?: string;
            page?: number;
            pageSize?: number;
          },
        ) => {
          const filter: SignalFilter = {};
          if (args.projectId) filter.projectId = args.projectId as unknown as ProjectId;
          if (args.name) filter.nameSearch = args.name;
          if (args.status) filter.status = args.status as SignalStatus;

          const pagination: Pagination = {
            page: args.page ?? 1,
            pageSize: args.pageSize ?? 20,
          };

          return signalService.querySignals(filter, pagination);
        },
      },
      TransportLayer: {
        protocolAttrs: (parent: any) =>
          parent.protocolAttrs ? JSON.stringify(parent.protocolAttrs) : null,
      },
    },
  });
}
