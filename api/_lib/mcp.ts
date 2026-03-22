import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function createMcpClient(): Promise<Client> {
  if (!process.env.DFS_API_LOGIN || !process.env.DFS_API_PASSWORD) {
    throw new Error('DFS_API_LOGIN and DFS_API_PASSWORD must be set');
  }

  const credentials = Buffer.from(
    `${process.env.DFS_API_LOGIN}:${process.env.DFS_API_PASSWORD}`
  ).toString('base64');

  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.dataforseo.com/mcp'),
    {
      requestInit: {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      },
    }
  );

  const client = new Client({ name: 'martech-seo', version: '1.0.0' });

  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MCP connection timed out after 30s')), 30000)
  );

  await Promise.race([connectPromise, timeoutPromise]);
  return client;
}

export async function closeMcpClient(client: Client | null): Promise<void> {
  if (client) {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
  }
}
