import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let mcpClient: Client | null = null;
let connecting = false;

export async function getMcpClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  // Prevent multiple simultaneous connection attempts
  if (connecting) {
    // Wait for the other connection to complete
    await new Promise((r) => setTimeout(r, 2000));
    if (mcpClient) return mcpClient;
    throw new Error('MCP connection already in progress');
  }

  connecting = true;

  try {
    // Validate credentials exist
    if (!process.env.DFS_API_LOGIN || !process.env.DFS_API_PASSWORD) {
      throw new Error('DFS_API_LOGIN and DFS_API_PASSWORD must be set in .env');
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

    // Add timeout for connection
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MCP connection timed out after 30s')), 30000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    mcpClient = client;
    console.log('Connected to DataForSEO MCP server');
    return mcpClient;
  } catch (err) {
    mcpClient = null;
    console.error('MCP connection failed:', (err as Error).message);
    throw err;
  } finally {
    connecting = false;
  }
}

export async function closeMcpClient(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // Ignore close errors
    }
    mcpClient = null;
    console.log('DataForSEO MCP server disconnected');
  }
}
