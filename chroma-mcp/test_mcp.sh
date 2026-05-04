#!/bin/bash
# Send MCP JSON-RPC messages and get responses
send() {
  echo "$1"
}

# Initialize
send '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
sleep 1
# List tools
send '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
sleep 0.5
