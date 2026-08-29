import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)      // Supabase session (root/admin)
  const [profile, setProfile] = useState(null)      // row from profiles table
  const [tenant, setTenant] = useState(null)        // row from tenants table
  const [tenantConfig, setTenantConfig] = useState(null) // row from tenant_config (ajustes)
  const [barberSession, setBarberSession] = useState(null) // { barber: {...} }
  const [loading, setLoading] = useState(true)
  const loadedUserRef = useRef(null)   // evita recargar el perfil en cada TOKEN_REFRESHED

  // Restore barber session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('mb_barber_session')
    if (stored) {
      try { setBarberSession(JSON.parse(stored)) } catch {}
    }
  }, [])

  useEffect(() => {
    let alive = true
    // Red de seguridad: pase lo que pase, la app nunca queda clavada en "cargando"
    const failsafe = setTimeout(() => { if (alive) setLoading(false) }, 8000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setSession(session)
      if (session) {
        // IMPORTANTE: no llamar a supabase con await DENTRO de este callback.
        // Supabase mantiene un lock de auth mientras corre el callback; si acá
        // adentro se hace otra consulta se produce un deadlock que deja el login
        // colgado en "Ingresando..." / la app en "cargando". Se difiere para que
        // el callback termine y libere el lock antes de consultar el perfil.
        setTimeout(() => { if (alive) loadProfile(session.user.id) }, 0)
      } else {
        loadedUserRef.current = null
        setProfile(null); setTenant(null); setTenantConfig(null); setLoading(false)
      }
    })

    return () => { alive = false; clearTimeout(failsafe); subscription.unsubscribe() }
  }, [])

  // tenant_config (ajustes como el stock) aparte: nunca bloquea el arranque de la app
  useEffect(() => {
    const tid = profile?.tenant_id
    if (!tid) { setTenantConfig(null); return }
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('tenant_config')
          .select('stock_enabled')
          .eq('tenant_id', tid)
          .maybeSingle()
        if (active) setTenantConfig(data || null)
      } catch {
        /* stock_enabled puede no existir todavía; se ignora */
      }
    })()
    return () => { active = false }
  }, [profile?.tenant_id])

  async function loadProfile(userId, { force = false } = {}) {
    // Ya está cargado este usuario → no re-consultar (p.ej. en TOKEN_REFRESHED)
    if (!force && loadedUserRef.current === userId) { setLoading(false); return }
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*, tenants(*)')
        .eq('id', userId)
        .single()

      if (prof) {
        loadedUserRef.current = userId
        setProfile(prof)
        setTenant(prof.tenants || null)
      }
    } catch (e) {
      console.warn('loadProfile:', e?.message || e)
    } finally {
      // Siempre: si esto no corre, la app queda en "cargando" para siempre
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    clearBarberSession()
    clearProfileUnlocks()
    await supabase.auth.signOut()
  }

  // ── "Recordar" el perfil en este dispositivo ──────────────────────────────
  // Una vez que alguien entró como Administrador o como un Barbero puntual y
  // puso bien la contraseña/pin, queda registrado en ESTE equipo y no se le
  // vuelve a pedir. Se borra al cerrar sesión ("Cambiar cuenta").
  function rememberProfileUnlock(kind, id) {
    if (!id) return
    try {
      if (kind === 'admin') {
        localStorage.setItem('mb_admin_unlock', id)
      } else if (kind === 'barber') {
        const arr = JSON.parse(localStorage.getItem('mb_barber_unlock') || '[]')
        if (!arr.includes(id)) {
          arr.push(id)
          localStorage.setItem('mb_barber_unlock', JSON.stringify(arr))
        }
      }
    } catch {}
  }

  function isProfileUnlocked(kind, id) {
    if (!id) return false
    try {
      if (kind === 'admin') return localStorage.getItem('mb_admin_unlock') === id
      if (kind === 'barber') return JSON.parse(localStorage.getItem('mb_barber_unlock') || '[]').includes(id)
    } catch {}
    return false
  }

  function clearProfileUnlocks() {
    try {
      localStorage.removeItem('mb_admin_unlock')
      localStorage.removeItem('mb_barber_unlock')
    } catch {}
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
      signIn, signOut, setBarber, clearBarberSession, loadProfile, setStockEnabled,
      rememberProfileUnlock, isProfileUnlocked,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
