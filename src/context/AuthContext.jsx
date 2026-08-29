import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)      // Supabase session (root/admin)
  const [profile, setProfile] = useState(null)      // row from profiles table
  const [tenant, setTenant] = useState(null)        // row from tenants table
  const [tenantConfig, setTenantConfig] = useState(null) // row from tenant_config (ajustes)
  const [barberSession, setBarberSession] = useState(null) // { barber: {...} }
  const [loading, setLoading] = useState(true)

  // Restore barber session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('mb_barber_session')
    if (stored) {
      try { setBarberSession(JSON.parse(stored)) } catch {}
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setTenant(null); setTenantConfig(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, tenants(*)')
      .eq('id', userId)
      .single()

    if (prof) {
      setProfile(prof)
      setTenant(prof.tenants || null)
      if (prof.tenant_id) {
        // stock_enabled puede no existir todavía (migración no corrida) → cfg queda null
        const { data: cfg } = await supabase
          .from('tenant_config')
          .select('stock_enabled')
          .eq('tenant_id', prof.tenant_id)
          .maybeSingle()
        setTenantConfig(cfg || null)
      }
    }
    setLoading(false)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    clearBarberSession()
    await supabase.auth.signOut()
  }

  function setBarber(barber) {
    const bs = { barber }
    setBarberSession(bs)
    localStorage.setItem('mb_barber_session', JSON.stringify(bs))
  }

  function clearBarberSession() {
    setBarberSession(null)
    localStorage.removeItem('mb_barber_session')
  }

  const isRoot  = profile?.role === 'root'
  const isAdmin = profile?.role === 'admin'
  const isBarber = !!barberSession?.barber && !!session
  const stockEnabled = !!tenantConfig?.stock_enabled

  // Lo usa Configuración para reflejar el switch sin recargar la app
  function setStockEnabled(v) {
    setTenantConfig(c => ({ ...(c || {}), stock_enabled: !!v }))
  }

  return (
    <AuthContext.Provider value={{
      session, profile, tenant, tenantConfig, barberSession,
      loading, isRoot, isAdmin, isBarber, stockEnabled,
      signIn, signOut, setBarber, clearBarberSession, loadProfile, setStockEnabled
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
