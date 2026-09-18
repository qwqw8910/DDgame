// ================================================================
//  Supabase client（index 頁面建立/查詢房間用）
// ================================================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

// 延遲初始化：env 缺失時不在啟動時崩潰，只有實際呼叫 DB 方法時才報錯
let _supabase = null
function getClient() {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，請建立 .env 檔')
    }
    _supabase = createClient(supabaseUrl, supabaseKey)
  }
  return _supabase
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop]
  },
})

export const DB = {
  async createRoom(roomId, hostPlayerId, maxPlayers) {
    const { error } = await supabase.from('rooms').insert({
      id: roomId,
      host_player_id: hostPlayerId,
      max_players: maxPlayers,
      status: 'waiting',
    })
    if (error) throw error
  },

  async getRoom(roomId) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()
    if (error) throw error
    return data
  },
}
