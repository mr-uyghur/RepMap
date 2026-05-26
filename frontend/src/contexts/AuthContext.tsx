import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import client from '../api/client'

interface AuthUser {
  id: number
  email: string
  display_name: string
}

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    client
      .get('/api/v1/auth/session/')
      .then((res) => {
        if (res.data.is_authenticated) {
          setUser(res.data.user)
        }
      })
      .catch(() => {
        // Session check failed — stay anonymous
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(() => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
    const next = encodeURIComponent(window.location.href)
    window.location.href = `${base}/accounts/google/login/?process=login&next=${next}`
  }, [])

  const logout = useCallback(async () => {
    try {
      await client.post('/api/v1/auth/logout/')
    } catch {
      // Best-effort logout
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
