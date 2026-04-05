/**
 * Singleton WebSocket Client for CampusVote Real-Time Telemetry
 */

class SocketClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000;
    this.url = import.meta.env.VITE_API_WS_URL || `ws://${window.location.hostname}:3000`;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      console.log(`🔌 Connecting to WebSocket: ${this.url}`);
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('✅ WebSocket Connected');
        this.reconnectAttempts = 0;
        this.emit('CONNECTION_SUCCESS', { timestamp: new Date().toISOString() });
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type) {
            this.emit(data.type, data.payload || data);
          }
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err);
        }
      };

      this.socket.onclose = () => {
        console.warn('⚠️ WebSocket Disconnected');
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('❌ WebSocket Error:', error);
      };
    } catch (err) {
      console.error('❌ WebSocket Connection Failed:', err);
      this.attemptReconnect();
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectInterval}ms...`);
      setTimeout(() => this.connect(), this.reconnectInterval);
    } else {
      console.error('❌ Max reconnect attempts reached. Please refresh.');
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

const socket = new SocketClient();
export default socket;
