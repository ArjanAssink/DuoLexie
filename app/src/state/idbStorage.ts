import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'duolexie'
const STORE = 'kv'

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE)
    },
  })
  return dbPromise
}

export async function get(key: string): Promise<string | null> {
  return (await (await db()).get(STORE, key)) ?? null
}

export async function set(key: string, value: string): Promise<void> {
  await (await db()).put(STORE, value, key)
}

export async function del(key: string): Promise<void> {
  await (await db()).delete(STORE, key)
}
