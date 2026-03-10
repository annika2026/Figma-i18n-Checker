const { spawn } = require('child_process');

class FigmaMCP {
  constructor() {
    this.mcpProcess = null;
  }

  // Initialize MCP connection
  async initialize() {
    try {
      // Use the existing MCP configuration from your Cursor setup
      this.mcpProcess = spawn('npx', [
        '-y', 
        'figma-developer-mcp', 
        '--figma-api-key=figd_m8kMENjyFjfegStzn2KPg4CjcALqIlDjn3wDHbRs', 
        '--stdio'
      ]);

      return new Promise((resolve, reject) => {
        this.mcpProcess.on('error', (error) => {
          console.error('MCP process error:', error);
          reject(error);
        });

        this.mcpProcess.on('exit', (code) => {
          console.log('MCP process exited with code:', code);
        });

        // Wait a moment for the process to start
        setTimeout(() => {
          resolve(true);
        }, 1000);
      });
    } catch (error) {
      console.error('Failed to initialize MCP:', error);
      throw error;
    }
  }

  // Get Figma file data using MCP
  async getFigmaData(fileKey) {
    try {
      if (!this.mcpProcess) {
        await this.initialize();
      }

      // Create a simple request to get file data
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'mcp_Framelink_Figma_MCP_get_figma_data',
        params: {
          fileKey: fileKey
        }
      };

      return new Promise((resolve, reject) => {
        let responseData = '';

        this.mcpProcess.stdout.on('data', (data) => {
          responseData += data.toString();
        });

        this.mcpProcess.stderr.on('data', (data) => {
          console.error('MCP stderr:', data.toString());
        });

        this.mcpProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`MCP process closed with code ${code}`));
            return;
          }

          try {
            const response = JSON.parse(responseData);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          } catch (error) {
            reject(new Error('Failed to parse MCP response'));
          }
        });

        // Send request
        this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
      });
    } catch (error) {
      console.error('MCP request failed:', error);
      throw error;
    }
  }

  // Close MCP connection
  close() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }
  }
}

module.exports = FigmaMCP;
