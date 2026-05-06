/**
 * Test the MCP server's ngdpbase_bulk_upload_attachments tool
 * Sends JSON-RPC requests via stdio to the MCP server
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const MCP_SERVER = './dist/mcp-server.js';

// JSON-RPC request ID counter
let requestId = 1;

function createRequest(method, params = {}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  }) + '\n';
}

async function testMCPBulkUpload() {
  console.log('=== MCP Server Bulk Upload Test ===\n');

  // Spawn the MCP server
  const mcp = spawn('node', [MCP_SERVER], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Collect stderr for logging
  mcp.stderr.on('data', (data) => {
    // MCP server logs to stderr
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.includes('error') || line.includes('Error')) {
        console.log('[MCP stderr]', line);
      }
    }
  });

  // Create readline interface for stdout
  const rl = createInterface({
    input: mcp.stdout,
    crlfDelay: Infinity
  });

  const responses = [];
  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      responses.push(response);
    } catch {
      // Ignore non-JSON lines
    }
  });

  // Helper to send request and wait for response
  async function sendRequest(method, params = {}) {
    const currentId = requestId;
    const request = createRequest(method, params);
    console.log(`Sending: ${method}`);
    mcp.stdin.write(request);

    // Wait for response with matching ID
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, 300000); // 5 minute timeout for bulk operations

      const checkResponse = setInterval(() => {
        const response = responses.find(r => r.id === currentId);
        if (response) {
          clearInterval(checkResponse);
          clearTimeout(timeout);
          resolve(response);
        }
      }, 100);
    });
  }

  try {
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 1: Initialize the connection
    console.log('\n1. Initializing MCP connection...');
    const initResponse = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    console.log('   Initialized:', initResponse.result ? 'OK' : 'Failed');

    // Step 2: Send initialized notification
    mcp.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: List tools to verify our tool exists
    console.log('\n2. Listing available tools...');
    const toolsResponse = await sendRequest('tools/list', {});
    const tools = toolsResponse.result?.tools || [];
    const bulkUploadTool = tools.find(t => t.name === 'ngdpbase_bulk_upload_attachments');
    console.log(`   Found ${tools.length} tools`);
    console.log(`   ngdpbase_bulk_upload_attachments: ${bulkUploadTool ? 'Available' : 'NOT FOUND'}`);

    if (!bulkUploadTool) {
      throw new Error('Bulk upload tool not found!');
    }

    // Step 4: Call the bulk upload tool with limit pattern
    // We'll use a pattern that matches only 5 specific files
    console.log('\n3. Calling ngdpbase_bulk_upload_attachments...');
    console.log('   Directory: /mnt/tank/jims/data/systems/wikis/images/');
    console.log('   Pattern: * (all files)');

    const uploadResponse = await sendRequest('tools/call', {
      name: 'ngdpbase_bulk_upload_attachments',
      arguments: {
        directory: '/mnt/tank/jims/data/systems/wikis/images/',
        pattern: '*',
        recursive: false
      }
    });

    // Parse the result
    console.log('\n4. Results:');
    if (uploadResponse.result?.content?.[0]?.text) {
      const result = JSON.parse(uploadResponse.result.content[0].text);
      console.log(`   Success: ${result.success}`);
      console.log(`   Uploaded: ${result.uploaded}`);
      console.log(`   Failed: ${result.failed}`);
      console.log(`   Total: ${result.total}`);
      console.log(`   Total Size: ${(result.totalSize / 1024).toFixed(1)} KB`);
      console.log(`   Message: ${result.message}`);

      if (result.files && result.files.length > 0) {
        console.log('\n   Files:');
        for (const file of result.files) {
          if (file.success) {
            console.log(`   ✓ ${file.filename} (${file.attachmentId?.substring(0, 12)}...)`);
          } else {
            console.log(`   ✗ ${file.filename}: ${file.error}`);
          }
        }
      }
    } else if (uploadResponse.error) {
      console.log('   Error:', uploadResponse.error.message);
    } else {
      console.log('   Raw response:', JSON.stringify(uploadResponse, null, 2));
    }

  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    // Clean up
    mcp.stdin.end();
    mcp.kill();
    console.log('\n=== Test Complete ===');
  }
}

testMCPBulkUpload().catch(console.error);
