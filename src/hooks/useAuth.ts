import { useEffect } from 'react'
import { useStore } from '../store/store'

export function useAuth() {
  const { user, authLoading, initAuth, signIn, signOut } = useStore()

  useEffect(() => {
    initAuth()
  }, [initAuth])

  return { user, authLoading, signIn, signOut }
}
