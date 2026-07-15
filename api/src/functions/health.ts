import { app } from '@azure/functions'
import { CosmosClient } from '@azure/cosmos'

/**
 * Deployment canary: reports whether the required environment variables are
 * present and whether Cosmos DB (database + containers) is reachable.
 * Never returns secret values, only booleans/statuses.
 */
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => {
    const endpoint = process.env.COSMOS_ENDPOINT
    const key = process.env.COSMOS_KEY

    const checks: Record<string, unknown> = {
      env_COSMOS_ENDPOINT: Boolean(endpoint),
      env_COSMOS_KEY: Boolean(key),
      env_JWT_SECRET: Boolean(process.env.JWT_SECRET),
      cosmosConnection: 'overgeslagen (env ontbreekt)',
      database_duolexie: 'niet gecheckt',
      container_auth: 'niet gecheckt',
      container_data: 'niet gecheckt',
    }

    if (endpoint && key) {
      const client = new CosmosClient({ endpoint, key })
      try {
        await client.getDatabaseAccount()
        checks.cosmosConnection = 'ok'
      } catch (err) {
        checks.cosmosConnection = `fout: ${err instanceof Error ? err.message : String(err)}`
        return { jsonBody: checks }
      }

      try {
        await client.database('duolexie').read()
        checks.database_duolexie = 'ok'
      } catch {
        checks.database_duolexie = 'ontbreekt'
      }
      for (const name of ['auth', 'data'] as const) {
        try {
          await client.database('duolexie').container(name).read()
          checks[`container_${name}`] = 'ok'
        } catch {
          checks[`container_${name}`] = 'ontbreekt'
        }
      }
    }

    return { jsonBody: checks }
  },
})
