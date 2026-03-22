import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function createMcpClient(): Promise<Client> {
  if (!process.env.DFS_API_LOGIN || !process.env.DFS_API_PASSWORD) {
    throw new Error('DFS_API_LOGIN and DFS_API_PASSWORD must be set');
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'dataforseo-mcp-server'],
    env: {
      ...process.env,
      DATAFORSEO_USERNAME: process.env.DFS_API_LOGIN || '',
      DATAFORSEO_PASSWORD: process.env.DFS_API_PASSWORD || '',
    },
  });

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
