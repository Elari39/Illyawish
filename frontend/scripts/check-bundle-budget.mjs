import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const distAssetsDir = join(process.cwd(), 'dist', 'assets')

const budgets = [
  {
    label: 'main app chunk',
    pattern: /^index-.*\.js$/,
    rawLimit: 280_000,
    gzipLimit: 90_000,
  },
  {
    label: 'chat page chunk',
    pattern: /^chat-page-.*\.js$/,
    rawLimit: 390_000,
    gzipLimit: 120_000,
  },
]

const assetNames = readdirSync(distAssetsDir)
const failures = []

for (const budget of budgets) {
  const assetName = assetNames.find((candidate) => budget.pattern.test(candidate))
  if (!assetName) {
    failures.push(`Missing asset for ${budget.label}`)
    continue
  }

  const assetPath = join(distAssetsDir, assetName)
  const source = readFileSync(assetPath)
  const rawSize = statSync(assetPath).size
  const gzipSize = gzipSync(source).length

  if (rawSize > budget.rawLimit || gzipSize > budget.gzipLimit) {
    failures.push(
      `${budget.label} exceeded budget: raw ${rawSize}B / ${budget.rawLimit}B, gzip ${gzipSize}B / ${budget.gzipLimit}B`,
    )
  } else {
    console.log(
      `${budget.label}: raw ${rawSize}B, gzip ${gzipSize}B within budget`,
    )
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}
