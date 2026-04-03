#!/usr/bin/env python3
"""
Databento → WebSocket Bridge
Connects to Databento live API for NQ futures trades and
forwards price ticks to the Node.js server via local WebSocket.

Usage:
  pip install databento websockets
  python feed-bridge.py

Environment variables:
  DATABENTO_API_KEY  - Your Databento API key (required)
  SYMBOL             - Futures symbol (default: NQ.c.0 = continuous front month)
  BRIDGE_PORT        - Local WebSocket port (default: 3002)
"""

import asyncio
import json
import os
import signal
import sys
from datetime import datetime

try:
    import databento as db
except ImportError:
    print("ERROR: databento package not installed. Run: pip install databento")
    sys.exit(1)

try:
    import websockets
    from websockets.asyncio.server import serve
except ImportError:
    print("ERROR: websockets package not installed. Run: pip install websockets")
    sys.exit(1)

# ── Config ──
API_KEY = os.environ.get("DATABENTO_API_KEY", "")
SYMBOL = os.environ.get("SYMBOL", "NQ.c.0")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "3002"))

if not API_KEY:
    print("ERROR: DATABENTO_API_KEY environment variable is required")
    sys.exit(1)

# ── WebSocket Server (sends ticks to Node.js) ──
connected_clients = set()

async def ws_handler(websocket):
    """Handle incoming WebSocket connections from Node.js"""
    connected_clients.add(websocket)
    remote = websocket.remote_address
    print(f"[BRIDGE] Node.js client connected from {remote}")
    try:
        async for msg in websocket:
            pass  # We don't expect messages from Node.js
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"[BRIDGE] Node.js client disconnected")

async def broadcast_tick(price, timestamp, symbol):
    """Send a tick to all connected Node.js clients"""
    if not connected_clients:
        return
    msg = json.dumps({
        "type": "tick",
        "price": price,
        "timestamp": timestamp,
        "symbol": symbol,
    })
    # Send to all connected clients
    disconnected = set()
    for ws in connected_clients:
        try:
            await ws.send(msg)
        except websockets.exceptions.ConnectionClosed:
            disconnected.add(ws)
    connected_clients.difference_update(disconnected)

# ── Databento Live Feed ──
async def run_databento_feed():
    """Connect to Databento live API and stream NQ trades"""
    print(f"[BRIDGE] Connecting to Databento live feed...")
    print(f"[BRIDGE] Symbol: {SYMBOL}")
    print(f"[BRIDGE] Dataset: GLBX.MDP3 (CME Globex)")

    client = db.Live(key=API_KEY)

    try:
        client.subscribe(
            dataset="GLBX.MDP3",
            schema="trades",
            symbols=[SYMBOL],
        )
        print(f"[BRIDGE] Subscribed to {SYMBOL} trades — waiting for data...")

        tick_count = 0
        for record in client:
            if hasattr(record, "price"):
                # Databento prices are in fixed-point (price / 1e9)
                price = record.price / 1e9
                ts = datetime.fromtimestamp(record.ts_event / 1e9).isoformat()

                tick_count += 1
                if tick_count <= 3 or tick_count % 100 == 0:
                    print(f"[BRIDGE] Tick #{tick_count}: {SYMBOL} @ {price:.2f} at {ts}")

                await broadcast_tick(price, ts, SYMBOL)

    except Exception as e:
        print(f"[BRIDGE] Databento error: {e}")
        raise

async def main():
    print("=" * 55)
    print("  Databento → WebSocket Bridge")
    print("=" * 55)
    print(f"  Symbol: {SYMBOL}")
    print(f"  Bridge WebSocket: ws://localhost:{BRIDGE_PORT}")
    print(f"  Node.js server should connect to this port")
    print("=" * 55)

    # Start WebSocket server
    server = await serve(ws_handler, "localhost", BRIDGE_PORT)
    print(f"[BRIDGE] WebSocket server listening on ws://localhost:{BRIDGE_PORT}")

    # Start Databento feed in a thread (it's synchronous)
    loop = asyncio.get_event_loop()
    feed_task = loop.run_in_executor(None, run_databento_sync)

    # Wait for shutdown signal
    stop = asyncio.Event()
    loop.add_signal_handler(signal.SIGINT, stop.set)
    loop.add_signal_handler(signal.SIGTERM, stop.set)
    await stop.wait()

    print("\n[BRIDGE] Shutting down...")
    server.close()
    await server.wait_closed()

def run_databento_sync():
    """Synchronous wrapper for Databento (uses blocking iteration)"""
    print(f"[BRIDGE] Connecting to Databento live feed...")
    print(f"[BRIDGE] Symbol: {SYMBOL}")

    client = db.Live(key=API_KEY)

    try:
        client.subscribe(
            dataset="GLBX.MDP3",
            schema="trades",
            symbols=[SYMBOL],
        )
        print(f"[BRIDGE] Subscribed to {SYMBOL} trades — waiting for data...")

        tick_count = 0
        loop = asyncio.new_event_loop()

        for record in client:
            if hasattr(record, "price"):
                price = record.price / 1e9
                ts = datetime.fromtimestamp(record.ts_event / 1e9).isoformat()

                tick_count += 1
                if tick_count <= 5 or tick_count % 100 == 0:
                    print(f"[BRIDGE] Tick #{tick_count}: {SYMBOL} @ {price:.2f} at {ts}")

                # Broadcast to connected WebSocket clients
                future = asyncio.run_coroutine_threadsafe(
                    broadcast_tick(price, ts, SYMBOL),
                    asyncio.get_event_loop()
                )
                try:
                    future.result(timeout=1)
                except Exception:
                    pass

    except Exception as e:
        print(f"[BRIDGE] Databento error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
