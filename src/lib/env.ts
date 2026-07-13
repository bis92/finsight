import 'server-only'

export type DataSource = 'mock' | 'live'

export function getDataSource(): DataSource {
  const dataSource = process.env.DATA_SOURCE ?? 'mock'

  if (dataSource !== 'mock' && dataSource !== 'live') {
    throw new Error('DATA_SOURCE must be either "mock" or "live"')
  }

  return dataSource
}
