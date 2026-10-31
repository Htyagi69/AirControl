#!/usr/bin/env python3
"""
Antigravity Keyboard - Desktop WebSocket Receiver
Run this on your laptop. Your phone connects to it via the Expo app.

Install dependencies:
    pip install websockets pyautogui

Then run:
    python server.py
"""

import asyncio
import json
import pyautogui
import websockets
import time

# ── Key name mapping (phone key → pyautogui key name) ──────────────────────
KEY_MAP = {
    'Backspace': 'backspace', 'Back': 'backspace',
    'Enter': 'enter',        'Return': 'enter',
    'Escape': 'escape',      'Escape': 'escape',
    'Tab': 'tab',
    'Space': 'space',        ' ': 'space',
    'left': 'left',          'Left': 'left',
    'right': 'right',        'Right': 'right',
    'up': 'up',              'Up': 'up',
    'down': 'down',          'Down': 'down',
    'ctrl': 'ctrl',          'LControl': 'ctrl',
    'alt': 'alt',            'LMenu': 'alt',
    'win': 'win',            'LWin': 'winleft',
    'shift': 'shift',
    # Media keys
    'play_pause': 'playpause',
    'next': 'nexttrack',
    'prev': 'prevtrack',
    'volume_up': 'volumeup',
    'volume_down': 'volumedown',
    'mute': 'volumemute',
}

# Disable pyautogui failsafe (move mouse to top-left to abort)
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0  # No delay between actions

held_keys = set()  # Track currently held modifier keys


def resolve_key(key: str, code: str = '') -> str:
    """Resolve a phone key name to a pyautogui key name."""
    return KEY_MAP.get(key) or KEY_MAP.get(code) or key.lower()


async def handler(websocket):
    addr = websocket.remote_address
    print(f"[+] Phone connected from {addr[0]}:{addr[1]}")

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            mtype = msg.get('type', '')

            # ── Ping/pong ────────────────────────────────────────────────────
            if mtype == 'ping':
                await websocket.send(json.dumps({'type': 'ping'}))

            # ── Key down ─────────────────────────────────────────────────────
            elif mtype == 'keydown':
                key = resolve_key(msg.get('key', ''), msg.get('code', ''))
                try:
                    pyautogui.keyDown(key)
                    held_keys.add(key)
                    print(f"  ↓ keydown: {key}")
                except Exception as e:
                    print(f"  ! keydown error ({key}): {e}")

            # ── Key up ───────────────────────────────────────────────────────
            elif mtype == 'keyup':
                key = resolve_key(msg.get('key', ''), msg.get('code', ''))
                try:
                    pyautogui.keyUp(key)
                    held_keys.discard(key)
                    print(f"  ↑ keyup:   {key}")
                except Exception as e:
                    print(f"  ! keyup error ({key}): {e}")

            # ── Type a string ────────────────────────────────────────────────
            elif mtype == 'string':
                value = msg.get('value', '')
                print(f"  ✎ string:  {repr(value)}")
                try:
                    # Handle embedded newlines as Enter presses
                    parts = value.split('\n')
                    for i, part in enumerate(parts):
                        if part:
                            pyautogui.typewrite(part, interval=0.02)
                        if i < len(parts) - 1:
                            pyautogui.press('enter')
                except Exception as e:
                    print(f"  ! string error: {e}")

            # ── Mouse move ───────────────────────────────────────────────────
            elif mtype == 'mouse_move':
                dx = msg.get('dx', 0)
                dy = msg.get('dy', 0)
                try:
                    pyautogui.moveRel(dx, dy, duration=0)
                except Exception as e:
                    print(f"  ! mouse_move error: {e}")

            # ── Mouse click ──────────────────────────────────────────────────
            elif mtype == 'mouse_click':
                button = msg.get('button', 'left')
                is_up = msg.get('up', False)
                try:
                    if is_up:
                        pyautogui.mouseUp(button=button)
                    else:
                        pyautogui.mouseDown(button=button)
                    print(f"  🖱  mouse {button} {'up' if is_up else 'down'}")
                except Exception as e:
                    print(f"  ! mouse_click error: {e}")

            # ── Mouse scroll ─────────────────────────────────────────────────
            elif mtype == 'mouse_scroll':
                clicks = msg.get('clicks', 0)
                try:
                    pyautogui.scroll(clicks)
                except Exception as e:
                    print(f"  ! scroll error: {e}")

            # ── Media keys ───────────────────────────────────────────────────
            elif mtype == 'media':
                key = msg.get('key', '')
                mapped = KEY_MAP.get(key, key)
                try:
                    pyautogui.press(mapped)
                    print(f"  ♫  media:  {mapped}")
                except Exception as e:
                    print(f"  ! media error ({mapped}): {e}")

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # Release any stuck keys on disconnect
        for key in list(held_keys):
            try:
                pyautogui.keyUp(key)
            except Exception:
                pass
        held_keys.clear()
        print(f"[-] Phone disconnected from {addr[0]}:{addr[1]}")


async def main():
    host = '0.0.0.0'
    port = 8080
    print(f"╔══════════════════════════════════════════╗")
    print(f"║  Antigravity Keyboard Server  v1.0       ║")
    print(f"╚══════════════════════════════════════════╝")
    print(f"  Listening on ws://{host}:{port}")
    print(f"  Enter your laptop IP in the Expo app and tap Connect.")
    print(f"  Press Ctrl+C to stop.\n")

    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # run forever


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[!] Server stopped.")

