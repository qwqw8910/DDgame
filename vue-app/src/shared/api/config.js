// 後端 (Express + Socket.io) 的 base URL；HTTP 與 socket 共用同一個來源
export const SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
