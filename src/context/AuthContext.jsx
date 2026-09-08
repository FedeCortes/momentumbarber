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
        // Se piden todas las columnas de ajustes; si alguna todavía no existe
        // (migración sin correr), se reintenta con el set mínimo.
        let { data, error } = await supabase
          .from('tenant_config')
          .select('stock_enabled, booking_enabled, loyalty_enabled, loyalty_min')
          .eq('tenant_id', tid)
          .maybeSingle()
        if (error) {
          ({ data } = await supabase
            .from('tenant_config')
            .select('stock_enabled, booking_enabled')
            .eq('tenant_id', tid)
            .maybeSingle())
        }
        if (active) setTenantConfig(data || null)
      } catch {
        /* algunas columnas pueden no existir todavía; se ignora */
      }
    })()
    return () => { active = false }
  }, [profile?.tenant_id])

  async function loadProfile(userId, { force = false } = {}) {
    // Ya está cargado este usuario → no re-consultar (p.ej. en TOKEN_REFRESHED)
    if (!force && loadedUserRef.current === userId) { setLoading(false); return }
    try {
      // Reintenta ante fallos transitorios de red (si esto no carga, la app
      // queda inutilizable) — hasta 4 intentos con espera creciente.
      let prof = null
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await supabase
          .from('profiles')
          .select('*, tenants(*)')
          .eq('id', userId)
          .maybeSingle()
        if (!res.error) { prof = res.data; break }
        if (attempt < 3) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }

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
  const bookingEnabled = !!tenantConfig?.booking_enabled
  const loyaltyEnabled = !!tenantConfig?.loyalty_enabled
  const loyaltyMin = Number(tenantConfig?.loyalty_min) || 10

  // Lo usa Configuración para reflejar el switch sin recargar la app
  function setStockEnabled(v) {
    setTenantConfig(c => ({ ...(c || {}), stock_enabled: !!v }))
  }
  function setBookingEnabled(v) {
    setTenantConfig(c => ({ ...(c || {}), booking_enabled: !!v }))
  }
  function setLoyalty(patch) {
    setTenantConfig(c => ({ ...(c || {}), ...patch }))
  }

  return (
    <AuthContext.Provider value={{
      session, profile, tenant, tenantConfig, barberSession,
      loading, isRoot, isAdmin, isBarber, stockEnabled, bookingEnabled,
      loyaltyEnabled, loyaltyMin,
      signIn, signOut, setBarber, clearBarberSession, loadProfile,
      setStockEnabled, setBookingEnabled, setLoyalty,
      rememberProfileUnlock, isProfileUnlocked,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
