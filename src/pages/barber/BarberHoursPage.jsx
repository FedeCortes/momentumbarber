import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import HoursEditor from '../../components/booking/HoursEditor'

export default function BarberHoursPage() {
  const { tenant, barberSession } = useAuth()
  const barber = barberSession?.barber
  if (!tenant || !barber) return null

  return (
    <div className="pb-6">
      <Link to="/barber/perfil" className="flex items-center gap-1.5 text-cream/45 hover:text-cream text-sm mb-4 transition-colors">
        <ChevronLeft size={15} /> Mi perfil
      </Link>
      <h1 className="section-title mb-1">Mis horarios</h1>
      <p className="section-sub mb-5">Cuándo estás disponible para que te reserven turno</p>
      <div className="card">
        <HoursEditor tenantId={tenant.id} barberId={barber.id} variant="page" />
      </div>
    </div>
  )
}
