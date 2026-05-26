export * from './api-contract';
export * from './generated';
// Both barrels surface these names (api-contract re-exports the generated
// types under the same identifiers); re-export them explicitly from the
// curated api-contract layer to resolve the `export *` ambiguity.
export type {
  ApiMessage,
  CastVoteRequest,
  CreateMessageRequest,
  CreateProposalRequest,
  FederatedCommunitiesResponse,
} from './api-contract';
