// 把拖進來／選取的東西攤平成 { file, relPath }[]，資料夾會遞迴展開並保留相對路徑。

const IMAGE_RE = /\.(png|jpe?g|webp|avif|bmp)$/i

export function isSupportedImage(file) {
  return IMAGE_RE.test(file.name)
}

function readFileEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readAllEntries(dirEntry) {
  const reader = dirEntry.createReader()
  const all = []
  // readEntries 每次最多回傳約 100 筆，要一直讀到空陣列為止
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) return all
    all.push(...batch)
  }
}

async function walkEntry(entry, prefix) {
  if (entry.isFile) {
    return [{ file: await readFileEntry(entry), relPath: prefix + entry.name }]
  }
  const children = await readAllEntries(entry)
  const nested = await Promise.all(children.map((child) => walkEntry(child, `${prefix}${entry.name}/`)))
  return nested.flat()
}

/** 處理 drop 事件的 DataTransfer。entry 必須在第一個 await 之前同步取出，否則事件結束後會失效。 */
export async function collectFromDrop(dataTransfer) {
  const jobs = []
  for (const item of dataTransfer.items) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      jobs.push(walkEntry(entry, ''))
    } else {
      const file = item.getAsFile()
      if (file) jobs.push(Promise.resolve([{ file, relPath: file.name }]))
    }
  }
  const found = (await Promise.all(jobs)).flat()
  return found.filter(({ file }) => isSupportedImage(file))
}

/** 處理 <input type="file"> 的 FileList（選資料夾時 webkitRelativePath 有值）。 */
export function collectFromFileList(fileList) {
  return [...fileList]
    .filter(isSupportedImage)
    .map((file) => ({ file, relPath: file.webkitRelativePath || file.name }))
}
