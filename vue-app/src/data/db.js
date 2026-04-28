// ================================================================
//  Supabase client（index 頁面建立/查詢房間用）
// ================================================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

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
