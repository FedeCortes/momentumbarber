import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Pencil, Trash2, ReceiptText, CalendarDays, WalletCards, UserRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import DateRangePicker, { dateRangeLabel } from '../../components/ui/DateRangePicker'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import toast from 'react-hot-toast'

function fmt(n) { return Number(n || 0).toLocaleString('es-AR') }

function initialForm(expense) {
  return {
    name: expense?.name || '',
    total_price: expense?.total_price ?? '',
    payer_id: expense?.payer_id || '',
    detail: expense?.detail || '',
    expense_date: expense?.expense_date || format(new Date(), 'yyyy-MM-dd'),
  }
}

function ExpenseForm({ expense, payers, onSave, onClose }) {
  const { tenant } = useAuth()
  const [form, setForm] = useState(() => initialForm(expense))
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    if (!form.payer_id) return toast.error('Elegí un pagador para este gasto')
    if (Number(form.total_price) <= 0) return toast.error('El total debe ser mayor a cero')
    if (!form.expense_date) return toast.error('La fecha es obligatoria')

    setLoading(true)
    try {
      const payload = {
        tenant_id: tenant.id,
        name: form.name.trim(),
        payer_id: form.payer_id,
        total_price: Number(form.total_price),
        detail: form.detail.trim() || null,
        expense_date: form.expense_date,
      }

      const { error } = expense
        ? await supabase.from('expenses').update(payload).eq('id', expense.id)
        : await supabase.from('expenses').insert(payload)

      if (error) throw error
      toast.success(expense ? 'Gasto actualizado' : 'Gasto creado')
      onSave()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="label">Nombre *</label>
        <input
          className="input-dark"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Insumos, alquiler, limpieza"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Total *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input-dark"
            value={form.total_price}
            onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div>
          <label className="label">Fecha *</label>
          <input
            type="date"
            className="input-dark"
            value={form.expense_date}
            onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="label">Pagador *</label>
        <select
          className="input-dark"
          value={form.payer_id}
          onChange={e => setForm(f => ({ ...f, payer_id: e.target.value }))}
        >
          <option value="">Seleccionar pagador</option>
          {payers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {payers.length === 0 && (
        <div className="rounded-xl border border-gold/20 bg-gold/7 p-4 mt-2">
          <p className="text-cream/45 text-sm mb-3">Crea al menos un pagador antes de cargar un gasto.</p>
          <Link to="/admin/config" className="btn-gold text-sm">
            Agregar pagadores
          </Link>
        </div>
      )}

      <div>
        <label className="label">Detalle</label>
        <textarea
          className="input-dark min-h-28 resize-none"
          value={form.detail}
          onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
          placeholder="Notas, proveedor, comprobante o aclaración"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
        <button onClick={handleSave} disabled={loading} className="btn-gold flex-1">
          {loading ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function ExpenseRow({ expense, onEdit, onDelete }) {
  return (
    <div className="card flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
        <ReceiptText size={18} className="text-red-400/75" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-cream text-sm truncate">{expense.name}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-cream/35 text-xs">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} />
                {format(new Date(expense.expense_date + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRound size={12} />
                {expense.expense_payers?.name || 'Sin pagador'}
              </span>
            </div>
          </div>
          <span className="font-display text-xl text-red-400/85 shrink-0">${fmt(expense.total_price)}</span>
        </div>

        {expense.detail && (
          <p className="mt-3 text-cream/55 text-sm leading-relaxed whitespace-pre-wrap">{expense.detail}</p>
        )}
      </div>

      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onEdit(expense)} className="btn-ghost p-2" title="Editar gasto">
          <Pencil size={15} className="text-cream/50" />
        </button>
        <button onClick={() => onDelete(expense.id)} className="btn-ghost p-2 text-red-400/55 hover:text-red-400" title="Eliminar gasto">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  const { tenant } = useAuth()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [payers, setPayers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [expensesRes, payersRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('*, expense_payers(name)')
        .eq('tenant_id', tenant.id)
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('expense_payers')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name', { ascending: true }),
    ])

    if (expensesRes.error) toast.error(expensesRes.error.message)
    if (payersRes.error) toast.error(payersRes.error.message)
    setExpenses(expensesRes.data || [])
    setPayers(payersRes.data || [])
    setLoading(false)
  }, [tenant?.id, from, to])

  useEffect(() => { if (tenant?.id) load() }, [tenant?.id, load])

  function openNew() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(expense) {
    setEditing(expense)
    setModalOpen(true)
  }

  async function handleDelete() {
    const { error } = await supabase.from('expenses').delete().eq('id', deleteId)
    if (error) return toast.error(error.message)
    toast.success('Gasto eliminado')
    setDeleteId(null)
    load()
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.total_price || 0), 0)
  const byPayer = Object.values(expenses.reduce((acc, e) => {
    const payerName = e.expense_payers?.name || 'Sin pagador'
    acc[payerName] ||= { paidBy: payerName, total: 0, count: 0 }
    acc[payerName].total += Number(e.total_price || 0)
    acc[payerName].count += 1
    return acc
  }, {})).sort((a, b) => b.total - a.total)

  return (
    <div className="pb-8">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="section-title">Gastos</h1>
          <p className="section-sub capitalize">{dateRangeLabel(from, to)}</p>
        </div>
        <button onClick={openNew} className="btn-gold flex items-center gap-2 text-sm shrink-0">
          <Plus size={16} /> Nuevo
        </button>
      </div>

      <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <p className="text-cream/45 text-sm">
          Crea tus pagadores en Configuración para empezar a registrar gastos.
        </p>
        <Link to="/admin/config" className="btn-ghost text-gold border border-gold/20 px-4 py-2 text-sm hover:bg-gold/10 transition-colors">
          Ir a Configuración
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mt-6" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 my-5">
            <div className="stat-card col-span-2">
              <span className="stat-label">Gastos del período</span>
              <span className="stat-value text-red-400">${fmt(totalExpenses)}</span>
              <span className="text-cream/30 text-xs">{expenses.length} gasto{expenses.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="card p-4 bg-dark-200/80 border border-gold/20 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-sm text-cream">Resumen por pagador</h2>
                <p className="text-cream/35 text-xs mt-1">Totales por pagador.</p>
              </div>
              <p className="text-gold/65 text-[11px] leading-relaxed max-w-xl">
                No afectan el cierre.
              </p>
            </div>

            {byPayer.length === 0 ? (
              <p className="text-cream/30 text-sm">Sin gastos todavía.</p>
            ) : (
              <div className="space-y-3">
                {byPayer.map(item => (
                  <div key={item.paidBy} className="flex items-center justify-between gap-3 rounded-3xl border border-cream/10 bg-gold/5 px-4 py-3">
                    <div>
                      <p className="text-cream text-sm font-semibold truncate">{item.paidBy}</p>
                      <p className="text-cream/35 text-xs mt-1">{item.count} gasto{item.count !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="text-gold text-base font-semibold">${fmt(item.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {expenses.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="Sin gastos"
              description="Registra gastos fuera del cierre"
              action={<button onClick={openNew} className="btn-gold">Crear gasto</button>}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {expenses.map(expense => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  onEdit={openEdit}
                  onDelete={setDeleteId}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar gasto' : 'Nuevo gasto'}>
        <ExpenseForm
          expense={editing}
          payers={payers}
          onSave={() => { setModalOpen(false); load() }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar gasto"
        message="¿Eliminás este gasto? Esta acción no afecta ventas ni cierres."
        danger
      />
    </div>
  )
}
