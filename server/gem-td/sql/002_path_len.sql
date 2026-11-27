-- 排行榜加「迷宮路徑」：最長路徑 = 開波當下蟲要走的最長格數；基準 = 空地圖的最短路徑
-- 到 Supabase 的 SQL Editor 執行一次（兩張表都要）。沒執行之前成績仍會寫入，只是不含這兩欄。
alter table gem_td_scores       add column if not exists max_path_len  integer;
alter table gem_td_scores       add column if not exists base_path_len integer;
alter table gem_td_relay_scores add column if not exists max_path_len  integer;
alter table gem_td_relay_scores add column if not exists base_path_len integer;
