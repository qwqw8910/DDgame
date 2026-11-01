// 金額一律是「最小貨幣單位的整數」；這裡只負責與使用者輸入／顯示互轉
// ISO 4217 常用貨幣：[代碼, 中文名稱]。小數位數：預設 2，下面兩組例外須與後端 logic.js 一致
const ZERO_DIGITS = new Set(['TWD', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG', 'UGX', 'RWF', 'XAF', 'XOF', 'XPF', 'KMF', 'GNF', 'DJF', 'BIF', 'VUV'])
const THREE_DIGITS = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

const CURRENCY_LIST = [
  ['TWD', '新台幣'], ['JPY', '日圓'], ['KRW', '韓元'], ['USD', '美元'], ['EUR', '歐元'],
  ['CNY', '人民幣'], ['HKD', '港幣'], ['MOP', '澳門幣'], ['GBP', '英鎊'], ['AUD', '澳幣'],
  ['NZD', '紐西蘭幣'], ['CAD', '加拿大幣'], ['CHF', '瑞士法郎'], ['SGD', '新加坡幣'], ['THB', '泰銖'],
  ['VND', '越南盾'], ['MYR', '馬來西亞令吉'], ['IDR', '印尼盾'], ['PHP', '菲律賓披索'], ['INR', '印度盧比'],
  ['AED', '阿聯迪拉姆'], ['AFN', '阿富汗尼'], ['ALL', '阿爾巴尼亞列克'], ['AMD', '亞美尼亞德拉姆'], ['ANG', '荷屬安地列斯盾'],
  ['AOA', '安哥拉寬扎'], ['ARS', '阿根廷披索'], ['AWG', '阿魯巴弗羅林'], ['AZN', '亞塞拜然馬納特'], ['BAM', '波赫可兌換馬克'],
  ['BBD', '巴貝多元'], ['BDT', '孟加拉塔卡'], ['BGN', '保加利亞列弗'], ['BHD', '巴林第納爾'], ['BIF', '蒲隆地法郎'],
  ['BMD', '百慕達元'], ['BND', '汶萊元'], ['BOB', '玻利維亞諾'], ['BRL', '巴西雷亞爾'], ['BSD', '巴哈馬元'],
  ['BTN', '不丹努札姆'], ['BWP', '波札那普拉'], ['BYN', '白俄羅斯盧布'], ['BZD', '貝里斯元'], ['CDF', '剛果法郎'],
  ['CLP', '智利披索'], ['COP', '哥倫比亞披索'], ['CRC', '哥斯大黎加科朗'], ['CUP', '古巴披索'], ['CVE', '維德角埃斯庫多'],
  ['CZK', '捷克克朗'], ['DJF', '吉布地法郎'], ['DKK', '丹麥克朗'], ['DOP', '多明尼加披索'], ['DZD', '阿爾及利亞第納爾'],
  ['EGP', '埃及鎊'], ['ERN', '厄利垂亞納克法'], ['ETB', '衣索比亞比爾'], ['FJD', '斐濟元'], ['FKP', '福克蘭群島鎊'],
  ['GEL', '喬治亞拉里'], ['GHS', '迦納塞地'], ['GIP', '直布羅陀鎊'], ['GMD', '甘比亞達拉西'], ['GNF', '幾內亞法郎'],
  ['GTQ', '瓜地馬拉格查爾'], ['GYD', '蓋亞那元'], ['HNL', '宏都拉斯倫皮拉'], ['HTG', '海地古德'], ['HUF', '匈牙利福林'],
  ['ILS', '以色列新謝克爾'], ['IQD', '伊拉克第納爾'], ['IRR', '伊朗里亞爾'], ['ISK', '冰島克朗'], ['JMD', '牙買加元'],
  ['JOD', '約旦第納爾'], ['KES', '肯亞先令'], ['KGS', '吉爾吉斯索姆'], ['KHR', '柬埔寨瑞爾'], ['KMF', '葛摩法郎'],
  ['KPW', '北韓圜'], ['KWD', '科威特第納爾'], ['KYD', '開曼群島元'], ['KZT', '哈薩克堅戈'], ['LAK', '寮國基普'],
  ['LBP', '黎巴嫩鎊'], ['LKR', '斯里蘭卡盧比'], ['LRD', '賴比瑞亞元'], ['LSL', '賴索托洛蒂'], ['LYD', '利比亞第納爾'],
  ['MAD', '摩洛哥迪拉姆'], ['MDL', '摩爾多瓦列伊'], ['MGA', '馬達加斯加阿里亞里'], ['MKD', '北馬其頓第納爾'], ['MMK', '緬甸元'],
  ['MNT', '蒙古圖格里克'], ['MRU', '茅利塔尼亞烏吉亞'], ['MUR', '模里西斯盧比'], ['MVR', '馬爾地夫拉菲亞'], ['MWK', '馬拉威克瓦查'],
  ['MXN', '墨西哥披索'], ['MZN', '莫三比克梅蒂卡爾'], ['NAD', '納米比亞元'], ['NGN', '奈及利亞奈拉'], ['NIO', '尼加拉瓜科多巴'],
  ['NOK', '挪威克朗'], ['NPR', '尼泊爾盧比'], ['OMR', '阿曼里亞爾'], ['PAB', '巴拿馬巴波亞'], ['PEN', '秘魯索爾'],
  ['PGK', '巴布亞紐幾內亞基那'], ['PKR', '巴基斯坦盧比'], ['PLN', '波蘭茲羅提'], ['PYG', '巴拉圭瓜拉尼'], ['QAR', '卡達里亞爾'],
  ['RON', '羅馬尼亞列伊'], ['RSD', '塞爾維亞第納爾'], ['RUB', '俄羅斯盧布'], ['RWF', '盧安達法郎'], ['SAR', '沙烏地里亞爾'],
  ['SBD', '索羅門群島元'], ['SCR', '塞席爾盧比'], ['SDG', '蘇丹鎊'], ['SEK', '瑞典克朗'], ['SHP', '聖赫勒拿鎊'],
  ['SLE', '獅子山利昂'], ['SOS', '索馬利亞先令'], ['SRD', '蘇利南元'], ['SSP', '南蘇丹鎊'], ['STN', '聖多美普林西比多布拉'],
  ['SYP', '敘利亞鎊'], ['SZL', '史瓦帝尼里蘭吉尼'], ['TJS', '塔吉克索莫尼'], ['TMT', '土庫曼馬納特'], ['TND', '突尼西亞第納爾'],
  ['TOP', '東加潘加'], ['TRY', '土耳其里拉'], ['TTD', '千里達及托巴哥元'], ['TZS', '坦尚尼亞先令'], ['UAH', '烏克蘭格里夫納'],
  ['UGX', '烏干達先令'], ['UYU', '烏拉圭披索'], ['UZS', '烏茲別克索姆'], ['VES', '委內瑞拉玻利瓦'], ['VUV', '萬那杜瓦圖'],
  ['WST', '薩摩亞塔拉'], ['XAF', '中非法郎'], ['XCD', '東加勒比元'], ['XOF', '西非法郎'], ['XPF', '太平洋法郎'],
  ['YER', '葉門里亞爾'], ['ZAR', '南非蘭特'], ['ZMW', '尚比亞克瓦查'], ['ZWL', '辛巴威元'],
]

export const CURRENCIES = CURRENCY_LIST.map(([code, name]) => ({
  code,
  label: `${code} ${name}`,
  digits: ZERO_DIGITS.has(code) ? 0 : THREE_DIGITS.has(code) ? 3 : 2,
}))

export const digitsOf = (code) => CURRENCIES.find(c => c.code === code)?.digits ?? 2

/** 顯示：1234500 (USD) → "USD 12,345.00" */
export function formatMoney(minor, code = 'TWD') {
  const d = digitsOf(code)
  const n = (Math.abs(minor) / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  return `${minor < 0 ? '-' : ''}${code} ${n}`
}

/**
 * 換算成結算幣別（最小單位整數、四捨五入）。公式須與後端 logic.convertMinor 一致，
 * 這樣畫面上的金額才會跟「誰給誰」的結果對得上。
 * rate = 1 單位外幣 = rate 單位結算幣別
 */
export function convertMinor(amount, from, to, rate) {
  if (from === to) return amount
  return Math.round((amount / 10 ** digitsOf(from)) * rate * 10 ** digitsOf(to))
}

/** 使用者輸入的字串 → 最小單位整數；格式不合回傳 null */
export function parseMoney(text, code = 'TWD') {
  const d = digitsOf(code)
  const s = String(text ?? '').trim().replace(/,/g, '')
  if (!new RegExp(`^\\d+(\\.\\d{1,${Math.max(d, 1)}})?$`).test(s) || (d === 0 && s.includes('.'))) return null
  return Math.round(Number(s) * 10 ** d)
}

/** 最小單位整數 → 輸入框用字串 */
export function toInput(minor, code = 'TWD') {
  const d = digitsOf(code)
  return d === 0 ? String(minor) : (minor / 10 ** d).toFixed(d)
}

export const CATEGORIES = [
  { id: 'food',      label: '🍜 餐飲' },
  { id: 'transport', label: '🚗 交通' },
  { id: 'lodging',   label: '🏨 住宿' },
  { id: 'fun',       label: '🎡 娛樂' },
  { id: 'shopping',  label: '🛍️ 購物' },
  { id: 'daily',     label: '🧻 日用品' },
  { id: 'other',     label: '📦 其他' },
]
export const categoryLabel = (id) => CATEGORIES.find(c => c.id === id)?.label ?? CATEGORIES.at(-1).label

export const SPLIT_TYPES = [
  { id: 'equal',   label: '平均',     hint: '勾選的人均分' },
  { id: 'exact',   label: '指定金額', hint: '每人輸入確切金額，加總需等於總額' },
  { id: 'percent', label: '百分比',   hint: '每人輸入百分比，加總需為 100%' },
  { id: 'shares',  label: '份數',     hint: '例如 2 大人 1 小孩 = 2 : 2 : 1' },
  { id: 'adjust',  label: '調整',     hint: '先平分，再對個別人加減金額' },
]
