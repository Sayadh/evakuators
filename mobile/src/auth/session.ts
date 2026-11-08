/**
 * Credentials live in the platform secure store (Keychain / Keystore via
 * expo-secure-store). A stable per-install device id is generated once.
 */
import * as SecureStore from 'expo-secure-store'
import { randomUUID } from 'expo-crypto'

const TOKEN = 'evk.token'
const DEVICE = 'evk.deviceId'
const LANGUAGE = 'evk.language'

let cachedToken: string | null | undefined

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken
  cachedToken = await SecureStore.getItemAsync(TOKEN)
  return cachedToken
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token
  if (token) await SecureStore.setItemAsync(TOKEN, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
  else await SecureStore.deleteItemAsync(TOKEN)
}

/** AFTER_FIRST_UNLOCK so the background location task can read it while the phone is locked */
export async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE)
  if (existing) return existing
  const id = randomUUID()
  await SecureStore.setItemAsync(DEVICE, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })
  return id
}

export async function getLanguage(): Promise<'hy' | 'ru'> {
  return (await SecureStore.getItemAsync(LANGUAGE)) === 'ru' ? 'ru' : 'hy'
}

export async function setLanguage(language: 'hy' | 'ru'): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE, language)
}
