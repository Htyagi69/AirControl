import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Vibration,
  useWindowDimensions,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

// Themes configuration
const THEMES = {
  cyberpunk: {
    bgStart: '#080512',
    bgEnd: '#030206',
    keyBg: 'rgba(217, 70, 239, 0.1)',
    keyBorder: 'rgba(217, 70, 239, 0.25)',
    keyText: '#f472b6',
    keyActiveBg: '#d946ef',
    keyActiveText: '#ffffff',
    accent: '#d946ef',
    accentGlow: 'rgba(217, 70, 239, 0.4)',
    hudBg: 'rgba(20, 10, 30, 0.75)',
  },
  glassmorphic: {
    bgStart: '#0f172a',
    bgEnd: '#020617',
    keyBg: 'rgba(255, 255, 255, 0.05)',
    keyBorder: 'rgba(255, 255, 255, 0.12)',
    keyText: '#e2e8f0',
    keyActiveBg: 'rgba(255, 255, 255, 0.25)',
    keyActiveText: '#ffffff',
    accent: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.4)',
    hudBg: 'rgba(30, 41, 59, 0.7)',
  },
  neomint: {
    bgStart: '#022c22',
    bgEnd: '#02140f',
    keyBg: 'rgba(16, 185, 129, 0.1)',
    keyBorder: 'rgba(16, 185, 129, 0.25)',
    keyText: '#34d399',
    keyActiveBg: '#10b981',
    keyActiveText: '#02140f',
    accent: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.4)',
    hudBg: 'rgba(2, 44, 34, 0.75)',
  },
  matrix: {
    bgStart: '#000000',
    bgEnd: '#050c05',
    keyBg: 'rgba(0, 255, 0, 0.04)',
    keyBorder: 'rgba(0, 255, 0, 0.3)',
    keyText: '#39ff14',
    keyActiveBg: '#39ff14',
    keyActiveText: '#000000',
    accent: '#39ff14',
    accentGlow: 'rgba(57, 255, 20, 0.5)',
    hudBg: 'rgba(5, 15, 5, 0.85)',
  }
};

export default function KeyboardScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Configuration States
  const [activeTheme, setActiveTheme] = useState<keyof typeof THEMES>('cyberpunk');
  const theme = THEMES[activeTheme];

  const [activeMode, setActiveMode] = useState<'qwerty' | 'numpad' | 'trackpad' | 'macros' | 'media'>('qwerty');
  const [ipAddress, setIpAddress] = useState('192.168.31.245');
  const [port, setPort] = useState('8080');
  
  // Connection states
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [ping, setPing] = useState<number | null>(null);
  const [recentKey, setRecentKey] = useState<string>('');
  
  // Custom Macros state
  const [macros, setMacros] = useState([
    { label: 'Copy & Paste', value: 'ctrl+c,ctrl+v', isShortcut: true },
    { label: 'Save All', value: 'ctrl+s', isShortcut: true },
    { label: 'Open Terminal', value: 'win+r,cmd\n', isText: true },
    { label: 'My Email', value: 'hello@antigravity.io', isText: true },
    { label: 'Build Project', value: 'npm run build\n', isText: true }
  ]);
  const [newMacroLabel, setNewMacroLabel] = useState('');
  const [newMacroValue, setNewMacroValue] = useState('');

  // Keyboard customization settings
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [shiftActive, setShiftActive] = useState(false);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [winActive, setWinActive] = useState(false);
  const [trackpadSensitivity, setTrackpadSensitivity] = useState(1.8);

  // Trackpad internal refs
  const lastX = useRef(0);
  const lastY = useRef(0);
  const touchStartTime = useRef(0);
  const lastScrollY = useRef(0);

  // Ping interval ref
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Vibration helper
  const triggerHaptic = (ms = 15) => {
    if (hapticsEnabled && Platform.OS !== 'web') {
      Vibration.vibrate(ms);
    }
  };

  // Keyboard Connection
  const connectToDesktop = (targetIp = ipAddress) => {
    if (ws) {
      ws.close();
    }

    setStatus('connecting');
    triggerHaptic(50);
    
    try {
      const socket = new WebSocket(`ws://${targetIp.trim()}:${port}`);
      
      socket.onopen = () => {
        setWs(socket);
        setConnected(true);
        setStatus('connected');
        triggerHaptic([10, 50, 10]);
        
        // Start ping intervals
        let startPingTime = Date.now();
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            startPingTime = Date.now();
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 3000);

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ping') {
              const latency = Date.now() - startPingTime;
              setPing(latency);
            }
          } catch (e) {}
        };
      };

      socket.onclose = () => {
        setWs(null);
        setConnected(false);
        setStatus('disconnected');
        setPing(null);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      };

      socket.onerror = () => {
        setStatus('error');
        setConnected(false);
        setPing(null);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        triggerHaptic(100);
      };
      
    } catch (err) {
      setStatus('error');
    }
  };

  const disconnect = () => {
    if (ws) {
      ws.close();
    }
    triggerHaptic(30);
  };

  // Input transmission
  const sendKey = (key: string, customCode?: string) => {
    triggerHaptic(12);
    setRecentKey(key);
    
    // Auto clear recent key display
    setTimeout(() => {
      setRecentKey(prev => prev === key ? '' : prev);
    }, 1000);

    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Apply active modifiers
    let sendVal = key;
    if (shiftActive && key.length === 1) {
      sendVal = key.toUpperCase();
    }

    // Key Down event
    ws.send(JSON.stringify({
      type: 'keydown',
      key: sendVal,
      code: customCode || `Key${key.toUpperCase()}`
    }));

    // Key Up event
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'keyup',
        key: sendVal,
        code: customCode || `Key${key.toUpperCase()}`
      }));
    }, 30);

    // Disable non-persistent modifiers on key press
    if (shiftActive) setShiftActive(false);
  };

  const sendString = (value: string) => {
    triggerHaptic(20);
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'string',
      value
    }));
  };

  const sendMedia = (key: string) => {
    triggerHaptic(25);
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'media',
      key
    }));
  };

  // Mouse / Trackpad injection
  const sendMouseClick = (button: 'left' | 'right' | 'middle', up = false) => {
    triggerHaptic(15);
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'mouse_click',
      button,
      up
    }));
  };

  // Setup Trackpad Gestures
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    
    onPanResponderGrant: (evt, gestureState) => {
      lastX.current = gestureState.x0;
      lastY.current = gestureState.y0;
      touchStartTime.current = Date.now();
    },
    
    onPanResponderMove: (evt, gestureState) => {
      const dx = gestureState.moveX - lastX.current;
      const dy = gestureState.moveY - lastY.current;
      
      const finalDx = Math.round(dx * trackpadSensitivity);
      const finalDy = Math.round(dy * trackpadSensitivity);

      if (connected && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'mouse_move',
          dx: finalDx,
          dy: finalDy
        }));
      }

      lastX.current = gestureState.moveX;
      lastY.current = gestureState.moveY;
    },
    
    onPanResponderRelease: (evt, gestureState) => {
      const duration = Date.now() - touchStartTime.current;
      const dist = Math.sqrt(gestureState.dx * gestureState.dx + gestureState.dy * gestureState.dy);
      
      // Quick tap without motion triggers a Left click
      if (duration < 200 && dist < 8) {
        sendMouseClick('left', false);
        setTimeout(() => sendMouseClick('left', true), 40);
      }
    }
  }), [connected, trackpadSensitivity, ws]);

  // Scrollbar Responder
  const scrollResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt, gestureState) => {
      lastScrollY.current = gestureState.y0;
    },
    onPanResponderMove: (evt, gestureState) => {
      const dy = gestureState.moveY - lastScrollY.current;
      if (Math.abs(dy) > 5) {
        const clicks = dy > 0 ? -1 : 1; // negative to scroll down, positive up
        if (connected && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'mouse_scroll',
            clicks
          }));
        }
        lastScrollY.current = gestureState.moveY;
        triggerHaptic(5);
      }
    }
  }), [connected, ws]);

  // Add custom macro
  const addMacro = () => {
    if (!newMacroLabel.trim() || !newMacroValue.trim()) return;
    setMacros(prev => [
      ...prev,
      { label: newMacroLabel, value: newMacroValue, isText: true }
    ]);
    setNewMacroLabel('');
    setNewMacroValue('');
    triggerHaptic(30);
  };

  // Delete macro
  const removeMacro = (index: number) => {
    setMacros(prev => prev.filter((_, i) => i !== index));
    triggerHaptic(20);
  };

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, []);

  return (
    <LinearGradient
      colors={[theme.bgStart, theme.bgEnd]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* TOP STATUS HUB AND CONTROLLER */}
        <View style={[styles.hudContainer, { backgroundColor: theme.hudBg }]}>
          <View style={styles.hudHeader}>
            <Text style={styles.hudLogo}>⚡ ANTIGRAVITY</Text>
            
            <View style={styles.hudActions}>
              {/* Theme selectors */}
              {Object.keys(THEMES).map((tKey) => (
                <TouchableOpacity
                  key={tKey}
                  style={[
                    styles.themeButton,
                    activeTheme === tKey && { borderColor: theme.accent, backgroundColor: theme.keyBg }
                  ]}
                  onPress={() => {
                    setActiveTheme(tKey as any);
                    triggerHaptic(20);
                  }}
                >
                  <Text style={[styles.themeButtonText, { color: theme.keyText }]}>
                    {tKey.charAt(0).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Connection HUD row */}
          <View style={styles.connectionRow}>
            {connected ? (
              <View style={styles.connectedCard}>
                <View style={[styles.statusDot, { backgroundColor: '#10b981', shadowColor: '#10b981' }]} />
                <Text style={styles.statusText}>Connected to {ipAddress}</Text>
                {ping !== null && <Text style={[styles.pingText, { color: theme.accent }]}>{ping}ms</Text>}
                <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect}>
                  <Text style={styles.disconnectBtnText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.connectForm}>
                <TextInput
                  style={[styles.ipInput, { borderColor: theme.keyBorder, color: theme.keyText }]}
                  placeholder="Receiver IP (e.g. 192.168.31.245)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={ipAddress}
                  onChangeText={setIpAddress}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={[styles.connectBtn, { backgroundColor: theme.accent }]}
                  onPress={() => connectToDesktop()}
                  disabled={status === 'connecting'}
                >
                  {status === 'connecting' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.connectBtnText}>Connect</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Modes Switcher bar */}
          <View style={styles.modesContainer}>
            {(['qwerty', 'numpad', 'trackpad', 'macros', 'media'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.modeTab,
                  activeMode === m && { borderBottomColor: theme.accent, backgroundColor: 'rgba(255,255,255,0.02)' }
                ]}
                onPress={() => {
                  setActiveMode(m);
                  triggerHaptic(25);
                }}
              >
                <Text style={[
                  styles.modeTabText, 
                  { color: activeMode === m ? theme.accent : 'rgba(255,255,255,0.45)' }
                ]}>
                  {m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FEEDBACK KEY OVERLAY */}
        {recentKey !== '' && (
          <View style={[styles.popOverlay, { backgroundColor: theme.accent, shadowColor: theme.accent }]}>
            <Text style={styles.popOverlayText}>
              {recentKey.length === 1 ? recentKey.toUpperCase() : recentKey}
            </Text>
          </View>
        )}

        {/* MAIN CONTROLLER WORKSPACE */}
        <View style={styles.workspace}>
          
          {/* QWERTY LAYOUT */}
          {activeMode === 'qwerty' && (
            <View style={styles.keyboardBody}>
              {/* Row 1 */}
              <View style={styles.row}>
                {['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendKey(key)}
                  >
                    <Text style={[styles.keyText, { color: theme.keyText }]}>
                      {shiftActive ? key.toUpperCase() : key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Row 2 */}
              <View style={styles.row}>
                <View style={{ flex: 0.2 }} />
                {['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendKey(key)}
                  >
                    <Text style={[styles.keyText, { color: theme.keyText }]}>
                      {shiftActive ? key.toUpperCase() : key}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={{ flex: 0.2 }} />
              </View>

              {/* Row 3 */}
              <View style={styles.row}>
                <TouchableOpacity
                  style={[
                    styles.keyButton, 
                    { flex: 1.5, backgroundColor: shiftActive ? theme.accent : theme.keyBg, borderColor: theme.keyBorder }
                  ]}
                  onPress={() => {
                    setShiftActive(!shiftActive);
                    triggerHaptic(20);
                  }}
                >
                  <Text style={[styles.keyText, { color: shiftActive ? '#fff' : theme.keyText }]}>Shift</Text>
                </TouchableOpacity>

                {['z', 'x', 'c', 'v', 'b', 'n', 'm'].map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendKey(key)}
                  >
                    <Text style={[styles.keyText, { color: theme.keyText }]}>
                      {shiftActive ? key.toUpperCase() : key}
                    </Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.keyButton, { flex: 1.5, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('Backspace', 'Back')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText }]}>⌫</Text>
                </TouchableOpacity>
              </View>

              {/* Row 4: Modifiers, Space, Enter */}
              <View style={styles.row}>
                <TouchableOpacity
                  style={[
                    styles.keyButton, 
                    { flex: 1.2, backgroundColor: ctrlActive ? theme.accent : theme.keyBg, borderColor: theme.keyBorder }
                  ]}
                  onPress={() => {
                    setCtrlActive(!ctrlActive);
                    sendKey('ctrl', 'LControl');
                  }}
                >
                  <Text style={[styles.keyText, { color: ctrlActive ? '#fff' : theme.keyText, fontSize: 12 }]}>Ctrl</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.keyButton, 
                    { flex: 1.2, backgroundColor: winActive ? theme.accent : theme.keyBg, borderColor: theme.keyBorder }
                  ]}
                  onPress={() => {
                    setWinActive(!winActive);
                    sendKey('win', 'LWin');
                  }}
                >
                  <Text style={[styles.keyText, { color: winActive ? '#fff' : theme.keyText, fontSize: 12 }]}>Win</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.keyButton, 
                    { flex: 1.2, backgroundColor: altActive ? theme.accent : theme.keyBg, borderColor: theme.keyBorder }
                  ]}
                  onPress={() => {
                    setAltActive(!altActive);
                    sendKey('alt', 'LMenu');
                  }}
                >
                  <Text style={[styles.keyText, { color: altActive ? '#fff' : theme.keyText, fontSize: 12 }]}>Alt</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.keyButton, { flex: 4.5, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey(' ', 'Space')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText }]}>Space</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.keyButton, { flex: 1.8, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('Enter', 'Return')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText }]}>Enter</Text>
                </TouchableOpacity>
              </View>

              {/* Navigation Arrows block */}
              <View style={[styles.row, { paddingHorizontal: 40 }]}>
                <TouchableOpacity
                  style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('Tab', 'Tab')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText, fontSize: 12 }]}>Tab</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('Escape', 'Escape')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText, fontSize: 12 }]}>Esc</Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }} />
                
                <TouchableOpacity
                  style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('left', 'Left')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText }]}>◀</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'column', height: 45, width: 45, marginHorizontal: 3 }}>
                  <TouchableOpacity
                    style={[styles.keyButton, { height: 21, width: 45, marginHorizontal: 0, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendKey('up', 'Up')}
                  >
                    <Text style={[styles.keyText, { color: theme.keyText, fontSize: 10 }]}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.keyButton, { height: 21, width: 45, marginHorizontal: 0, marginTop: 3, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendKey('down', 'Down')}
                  >
                    <Text style={[styles.keyText, { color: theme.keyText, fontSize: 10 }]}>▼</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.keyButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('right', 'Right')}
                >
                  <Text style={[styles.keyText, { color: theme.keyText }]}>▶</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* NUMPAD LAYOUT */}
          {activeMode === 'numpad' && (
            <View style={styles.numpadBody}>
              <View style={styles.numpadGrid}>
                {/* Rows of numbers */}
                {[
                  ['7', '8', '9', '/'],
                  ['4', '5', '6', '*'],
                  ['1', '2', '3', '-'],
                  ['0', '.', '=', '+']
                ].map((row, rIdx) => (
                  <View key={rIdx} style={styles.row}>
                    {row.map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[styles.numpadButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                        onPress={() => sendKey(num)}
                      >
                        <Text style={[styles.numpadButtonText, { color: theme.keyText }]}>{num}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
              
              {/* Side auxiliary column */}
              <View style={styles.numpadSideCol}>
                <TouchableOpacity
                  style={[styles.numpadAuxButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('Backspace', 'Back')}
                >
                  <Text style={[styles.numpadAuxButtonText, { color: theme.keyText }]}>Backspace</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.numpadAuxButton, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPress={() => sendKey('Escape', 'Escape')}
                >
                  <Text style={[styles.numpadAuxButtonText, { color: theme.keyText }]}>Clear / Esc</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.numpadAuxButton, { flex: 2, backgroundColor: theme.accent }]}
                  onPress={() => sendKey('Enter', 'Return')}
                >
                  <Text style={[styles.numpadAuxButtonText, { color: activeTheme === 'neomint' ? '#000' : '#fff', fontWeight: 'bold' }]}>Enter</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TRACKPAD & MOUSE CONTROL */}
          {activeMode === 'trackpad' && (
            <View style={styles.trackpadContainer}>
              <View style={styles.trackpadGrid}>
                {/* Huge Trackpad Panel */}
                <View 
                  style={[styles.trackpadSurface, { borderColor: theme.keyBorder }]}
                  {...panResponder.panHandlers}
                >
                  <Text style={[styles.trackpadWatermark, { color: 'rgba(255,255,255,0.04)' }]}>TRACKPAD</Text>
                  <Text style={styles.trackpadHint}>Slide to move cursor • Tap to Left Click</Text>
                </View>
                
                {/* Scrollbar on side */}
                <View 
                  style={[styles.scrollBarSurface, { borderColor: theme.keyBorder, backgroundColor: theme.keyBg }]}
                  {...scrollResponder.panHandlers}
                >
                  <Text style={styles.scrollBarText}>▲</Text>
                  <Text style={styles.scrollBarText}>S</Text>
                  <Text style={styles.scrollBarText}>C</Text>
                  <Text style={styles.scrollBarText}>R</Text>
                  <Text style={styles.scrollBarText}>O</Text>
                  <Text style={styles.scrollBarText}>L</Text>
                  <Text style={styles.scrollBarText}>L</Text>
                  <Text style={styles.scrollBarText}>▼</Text>
                </View>
              </View>

              {/* Bottom Mouse Buttons */}
              <View style={styles.mouseButtonsRow}>
                <TouchableOpacity
                  style={[styles.mouseBtn, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPressIn={() => sendMouseClick('left', false)}
                  onPressOut={() => sendMouseClick('left', true)}
                >
                  <Text style={[styles.mouseBtnText, { color: theme.keyText }]}>LEFT CLICK</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.mouseBtn, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                  onPressIn={() => sendMouseClick('right', false)}
                  onPressOut={() => sendMouseClick('right', true)}
                >
                  <Text style={[styles.mouseBtnText, { color: theme.keyText }]}>RIGHT CLICK</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* MACROS & KEYBOARD SHORTCUTS */}
          {activeMode === 'macros' && (
            <ScrollView style={styles.scrollWorkspace} contentContainerStyle={{ paddingBottom: 50 }}>
              
              <Text style={[styles.sectionTitle, { color: theme.accent }]}>Execute System Shortcuts</Text>
              <View style={styles.shortcutsGrid}>
                {[
                  { label: 'Copy (Ctrl+C)', act: () => sendKey('c') }, 
                  { label: 'Paste (Ctrl+V)', act: () => sendKey('v') },
                  { label: 'Undo (Ctrl+Z)', act: () => sendKey('z') },
                  { label: 'Select All (Ctrl+A)', act: () => sendKey('a') },
                  { label: 'Show Desktop (Win+D)', act: () => {
                    if (connected && ws && ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'keydown', key: 'win', code: 'LWin' }));
                      ws.send(JSON.stringify({ type: 'keydown', key: 'd', code: 'KeyD' }));
                      setTimeout(() => {
                        ws.send(JSON.stringify({ type: 'keyup', key: 'd', code: 'KeyD' }));
                        ws.send(JSON.stringify({ type: 'keyup', key: 'win', code: 'LWin' }));
                      }, 50);
                    }
                  }},
                  { label: 'Lock screen (Win+L)', act: () => {
                    if (connected && ws && ws.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'keydown', key: 'win', code: 'LWin' }));
                      ws.send(JSON.stringify({ type: 'keydown', key: 'l', code: 'KeyL' }));
                      setTimeout(() => {
                        ws.send(JSON.stringify({ type: 'keyup', key: 'l', code: 'KeyL' }));
                        ws.send(JSON.stringify({ type: 'keyup', key: 'win', code: 'LWin' }));
                      }, 50);
                    }
                  }}
                ].map((s, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.shortcutCard, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={s.act}
                  >
                    <Text style={[styles.shortcutText, { color: theme.keyText }]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: theme.accent, marginTop: 20 }]}>Custom Macro Triggers</Text>
              
              <View style={styles.macrosList}>
                {macros.map((m, idx) => (
                  <View key={idx} style={[styles.macroRow, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}>
                    <TouchableOpacity 
                      style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 16 }}
                      onPress={() => sendString(m.value)}
                    >
                      <Text style={[styles.macroLabel, { color: theme.keyText }]}>{m.label}</Text>
                      <Text style={styles.macroValue} numberOfLines={1}>{m.value.replace('\n', ' [Enter]')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.macroDeleteBtn} 
                      onPress={() => removeMacro(idx)}
                    >
                      <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Form to create new Macro */}
              <View style={[styles.macroForm, { borderColor: theme.keyBorder, backgroundColor: 'rgba(0,0,0,0.1)' }]}>
                <Text style={[styles.formTitle, { color: theme.keyText }]}>Create New Macro</Text>
                <TextInput
                  style={[styles.macroInput, { borderColor: theme.keyBorder, color: theme.keyText }]}
                  placeholder="Macro Label (e.g. Email signature)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={newMacroLabel}
                  onChangeText={setNewMacroLabel}
                />
                <TextInput
                  style={[styles.macroInput, { borderColor: theme.keyBorder, color: theme.keyText }]}
                  placeholder="Text to type automatically..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={newMacroValue}
                  onChangeText={setNewMacroValue}
                />
                <TouchableOpacity
                  style={[styles.macroCreateBtn, { backgroundColor: theme.accent }]}
                  onPress={addMacro}
                >
                  <Text style={styles.macroCreateBtnText}>Save Macro</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          )}

          {/* MEDIA CONTROLS PANEL */}
          {activeMode === 'media' && (
            <View style={styles.mediaContainer}>
              <Text style={[styles.sectionTitle, { color: theme.accent, alignSelf: 'center' }]}>Media Command Station</Text>
              
              <View style={styles.mediaGrid}>
                {/* Volume and Play controls */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.mediaCard, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('prev')}
                  >
                    <Text style={styles.mediaIcon}>⏮</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Prev</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.mediaCard, { flex: 1.5, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('play_pause')}
                  >
                    <Text style={[styles.mediaIcon, { color: theme.accent }]}>⏯</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Play / Pause</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mediaCard, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('next')}
                  >
                    <Text style={styles.mediaIcon}>⏭</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Next</Text>
                  </TouchableOpacity>
                </View>

                {/* Volume Controls */}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.mediaCard, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('vol_down')}
                  >
                    <Text style={styles.mediaIcon}>🔉</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Volume -</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mediaCard, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('mute')}
                  >
                    <Text style={styles.mediaIcon}>🔇</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Mute</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mediaCard, { backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('vol_up')}
                  >
                    <Text style={styles.mediaIcon}>🔊</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Volume +</Text>
                  </TouchableOpacity>
                </View>

                {/* Stop button */}
                <View style={[styles.row, { paddingHorizontal: 80 }]}>
                  <TouchableOpacity
                    style={[styles.mediaCard, { flex: 1, backgroundColor: theme.keyBg, borderColor: theme.keyBorder }]}
                    onPress={() => sendMedia('stop')}
                  >
                    <Text style={styles.mediaIcon}>⏹</Text>
                    <Text style={[styles.mediaLabel, { color: theme.keyText }]}>Stop Playback</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Preferences Settings Block */}
              <View style={[styles.settingsPanel, { borderColor: theme.keyBorder, backgroundColor: theme.keyBg }]}>
                <Text style={[styles.settingsTitle, { color: theme.keyText }]}>Keyboard Settings</Text>
                
                <View style={styles.settingsRow}>
                  <Text style={styles.settingsLabel}>Tactile Haptic Vibrations</Text>
                  <TouchableOpacity
                    style={[styles.toggleBtn, hapticsEnabled && { backgroundColor: theme.accent }]}
                    onPress={() => {
                      setHapticsEnabled(!hapticsEnabled);
                      triggerHaptic(30);
                    }}
                  >
                    <Text style={styles.toggleBtnText}>{hapticsEnabled ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.settingsRow}>
                  <Text style={styles.settingsLabel}>Mouse Sensitivity ({trackpadSensitivity.toFixed(1)}x)</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.sensitivityBtn}
                      onPress={() => {
                        setTrackpadSensitivity(p => Math.max(0.5, p - 0.3));
                        triggerHaptic(10);
                      }}
                    >
                      <Text style={{ color: '#fff' }}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sensitivityBtn}
                      onPress={() => {
                        setTrackpadSensitivity(p => Math.min(4.0, p + 0.3));
                        triggerHaptic(10);
                      }}
                    >
                      <Text style={{ color: '#fff' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

            </View>
          )}

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  hudContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  hudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  hudLogo: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
  },
  hudActions: {
    flexDirection: 'row',
    gap: 6,
  },
  themeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  themeButtonText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  connectionRow: {
    marginBottom: 8,
  },
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
    flex: 1,
  },
  pingText: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'CourierNewPS-BoldMT', android: 'monospace' }),
    fontWeight: 'bold',
    marginRight: 12,
  },
  disconnectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  disconnectBtnText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: 'bold',
  },
  connectForm: {
    flexDirection: 'row',
    gap: 8,
  },
  ipInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  connectBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 8,
    height: 38,
  },
  connectBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modeTabText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  popOverlay: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  popOverlayText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  workspace: {
    flex: 1,
    padding: 8,
  },
  keyboardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
  },
  keyButton: {
    height: 45,
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  keyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  numpadBody: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  numpadGrid: {
    flex: 3,
    justifyContent: 'center',
    gap: 6,
  },
  numpadButton: {
    height: 60,
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numpadButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  numpadSideCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  numpadAuxButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numpadAuxButtonText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  trackpadContainer: {
    flex: 1,
    gap: 8,
  },
  trackpadGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  trackpadSurface: {
    flex: 5.5,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.015)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  trackpadWatermark: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 6,
  },
  trackpadHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 8,
  },
  scrollBarSurface: {
    flex: 0.8,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  scrollBarText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  mouseButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    height: 50,
  },
  mouseBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mouseBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  scrollWorkspace: {
    flex: 1,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  shortcutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  shortcutCard: {
    width: '48%',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '700',
  },
  macrosList: {
    gap: 8,
    marginBottom: 20,
  },
  macroRow: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  macroLabel: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  macroValue: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  macroDeleteBtn: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.05)',
  },
  macroForm: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  macroInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  macroCreateBtn: {
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  macroCreateBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  mediaContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  mediaGrid: {
    justifyContent: 'center',
    gap: 12,
    flex: 1,
  },
  mediaCard: {
    flex: 1,
    height: 75,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  mediaIcon: {
    fontSize: 22,
  },
  mediaLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  settingsPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginTop: 15,
  },
  settingsTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  sensitivityBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  }
});
