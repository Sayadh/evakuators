/**
 * The driver's profile, loaded once per sign-in and re-read after every save
 * (and on pull-to-refresh). Shared by the Profile tab, its editors, Home's
 * greeting and More — so they never show two different versions of it.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { ProfileResponse } from '../api/types'

interface ProfileCtx {
  profile: ProfileResponse | null
  loading: boolean
  error: string | null
  reload(): Promise<void>
}

const Ctx = createContext<ProfileCtx | null>(null)

export function useProfile(): ProfileCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfile outside ProfileProvider')
  return ctx
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setProfile(await api.profile())
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'NETWORK')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return <Ctx.Provider value={{ profile, loading, error, reload }}>{children}</Ctx.Provider>
}
