import type { MatrixAdminClient } from './types';
import { SynapseClient } from './synapse';
import { ContinuwuityClient } from './continuwuity';

let cachedClient: MatrixAdminClient | null = null;

export function createMatrixClient(): MatrixAdminClient {
  if (cachedClient) return cachedClient;
  const type = process.env.MATRIX_HOMESERVER_TYPE ?? 'synapse';
  if (type === 'continuwuity') {
    cachedClient = new ContinuwuityClient();
  } else {
    cachedClient = new SynapseClient();
  }
  return cachedClient;
}
