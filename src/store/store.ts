import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { isDemoMode, getDemoUser, getDemoPositions, saveDemoPositions, generateId } from '../lib/demo-store'
import type { User, PositionWithLegs, Leg, PositionType, ConvictionLevel } from '../lib/types'

interface MonthlyIncome {
  totalCollected: number
  totalLosses: number
  netPremium: number
  closedTrades: Array<{
    ticker: string
    type: string
    premium: number
    closedAt: string
  }>
}

interface AppState {
  user: User | null
  positions: PositionWithLegs[]
  monthlyIncome: MonthlyIncome | null
  loading: boolean
  authLoading: boolean

  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void

  fetchPositions: () => Promise<void>
  addPosition: (data: {
    ticker: string
    type: PositionType
    thesis?: string
    conviction: ConvictionLevel
    strike: number
    expiration: string
    premium: number
    delta?: number
    ivRank?: number
  }) => Promise<void>
  addLeg: (positionId: string, leg: {
    type: Leg['type']
    strike: number
    expiration: string
    premium_collected?: number
    premium_paid?: number
    delta?: number
    notes?: string
  }) => Promise<void>
  closePosition: (positionId: string, closingPrice: number) => Promise<void>
  logRoll: (positionId: string, data: {
    closeDebit: number
    newStrike: number
    newExpiration: string
    newCredit: number
    notes?: string
  }) => Promise<void>

  fetchMonthlyIncome: () => Promise<void>
  initAuth: () => Promise<void>
  signIn: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  positions: [],
  monthlyIncome: null,
  loading: false,
  authLoading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  // ── Auth ──────────────────────────────────────────────
  initAuth: async () => {
    if (isDemoMode()) {
      set({ user: getDemoUser(), authLoading: false })
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()
      set({ user: data, authLoading: false })
    } else {
      set({ authLoading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()
        if (data) {
          set({ user: data })
        } else {
          const { data: newUser } = await supabase
            .from('users')
            .insert({
              id: session.user.id,
              email: session.user.email!,
            })
            .select()
            .single()
          set({ user: newUser })
        }
      } else {
        set({ user: null })
      }
    })
  },

  signIn: async (email: string) => {
    if (isDemoMode()) {
      set({ user: getDemoUser() })
      return { error: null }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message || null }
  },

  signOut: async () => {
    if (!isDemoMode()) {
      await supabase.auth.signOut()
    }
    set({ user: null, positions: [], monthlyIncome: null })
  },

  // ── Positions ─────────────────────────────────────────
  fetchPositions: async () => {
    const { user } = get()
    if (!user) return

    set({ loading: true })

    if (isDemoMode()) {
      set({ positions: getDemoPositions(), loading: false })
      return
    }

    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!positions) {
      set({ loading: false })
      return
    }

    const positionsWithLegs: PositionWithLegs[] = await Promise.all(
      positions.map(async (pos) => {
        const { data: legs } = await supabase
          .from('legs')
          .select('*')
          .eq('position_id', pos.id)
          .order('filled_at', { ascending: true })
        return { ...pos, legs: legs || [] }
      })
    )

    set({ positions: positionsWithLegs, loading: false })
  },

  addPosition: async (data) => {
    const { user } = get()
    if (!user) return

    if (isDemoMode()) {
      const positions = getDemoPositions()
      const posId = generateId()
      const newPos: PositionWithLegs = {
        id: posId,
        user_id: user.id,
        ticker: data.ticker.toUpperCase(),
        type: data.type,
        thesis: data.thesis || null,
        conviction: data.conviction,
        status: 'open',
        created_at: new Date().toISOString(),
        closed_at: null,
        legs: [{
          id: generateId(),
          position_id: posId,
          type: 'open',
          strike: data.strike,
          expiration: data.expiration,
          premium_collected: data.premium,
          premium_paid: 0,
          delta: data.delta || null,
          iv_rank: data.ivRank || null,
          filled_at: new Date().toISOString(),
          notes: null,
        }],
      }
      positions.unshift(newPos)
      saveDemoPositions(positions)
      set({ positions })
      return
    }

    const { data: position, error } = await supabase
      .from('positions')
      .insert({
        user_id: user.id,
        ticker: data.ticker.toUpperCase(),
        type: data.type,
        thesis: data.thesis || null,
        conviction: data.conviction,
      })
      .select()
      .single()

    if (error || !position) return

    await supabase.from('legs').insert({
      position_id: position.id,
      type: 'open',
      strike: data.strike,
      expiration: data.expiration,
      premium_collected: data.premium,
      premium_paid: 0,
      delta: data.delta || null,
      iv_rank: data.ivRank || null,
    })

    await get().fetchPositions()
  },

  addLeg: async (positionId, leg) => {
    if (isDemoMode()) {
      const positions = getDemoPositions()
      const pos = positions.find((p) => p.id === positionId)
      if (pos) {
        pos.legs.push({
          id: generateId(),
          position_id: positionId,
          strike: leg.strike,
          expiration: leg.expiration,
          type: leg.type,
          premium_collected: leg.premium_collected || 0,
          premium_paid: leg.premium_paid || 0,
          delta: leg.delta || null,
          iv_rank: null,
          filled_at: new Date().toISOString(),
          notes: leg.notes || null,
        })
        saveDemoPositions(positions)
        set({ positions: [...positions] })
      }
      return
    }

    await supabase.from('legs').insert({
      position_id: positionId,
      ...leg,
    })
    await get().fetchPositions()
  },

  closePosition: async (positionId, closingPrice) => {
    const { positions } = get()
    const position = positions.find((p) => p.id === positionId)
    if (!position) return

    if (isDemoMode()) {
      const allPositions = getDemoPositions()
      const pos = allPositions.find((p) => p.id === positionId)
      if (pos) {
        pos.legs.push({
          id: generateId(),
          position_id: positionId,
          type: 'close',
          strike: pos.legs[pos.legs.length - 1]?.strike || 0,
          expiration: pos.legs[pos.legs.length - 1]?.expiration || new Date().toISOString().split('T')[0],
          premium_collected: 0,
          premium_paid: closingPrice,
          delta: null,
          iv_rank: null,
          filled_at: new Date().toISOString(),
          notes: null,
        })
        pos.status = 'closed'
        pos.closed_at = new Date().toISOString()
        saveDemoPositions(allPositions)
        set({ positions: [...allPositions] })
        await get().fetchMonthlyIncome()
      }
      return
    }

    await supabase.from('legs').insert({
      position_id: positionId,
      type: 'close',
      strike: position.legs[position.legs.length - 1]?.strike || 0,
      expiration: position.legs[position.legs.length - 1]?.expiration || new Date().toISOString().split('T')[0],
      premium_collected: 0,
      premium_paid: closingPrice,
    })

    await supabase
      .from('positions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', positionId)

    await get().fetchPositions()
    await get().fetchMonthlyIncome()
  },

  logRoll: async (positionId, data) => {
    if (isDemoMode()) {
      const positions = getDemoPositions()
      const pos = positions.find((p) => p.id === positionId)
      if (pos) {
        pos.legs.push(
          {
            id: generateId(),
            position_id: positionId,
            type: 'roll_close',
            strike: 0,
            expiration: new Date().toISOString().split('T')[0],
            premium_collected: 0,
            premium_paid: data.closeDebit,
            delta: null,
            iv_rank: null,
            filled_at: new Date().toISOString(),
            notes: data.notes || 'Roll close',
          },
          {
            id: generateId(),
            position_id: positionId,
            type: 'roll_open',
            strike: data.newStrike,
            expiration: data.newExpiration,
            premium_collected: data.newCredit,
            premium_paid: 0,
            delta: null,
            iv_rank: null,
            filled_at: new Date().toISOString(),
            notes: data.notes || 'Roll open',
          },
        )
        saveDemoPositions(positions)
        set({ positions: [...positions] })
      }
      return
    }

    await supabase.from('legs').insert([
      {
        position_id: positionId,
        type: 'roll_close' as const,
        strike: 0,
        expiration: new Date().toISOString().split('T')[0],
        premium_collected: 0,
        premium_paid: data.closeDebit,
        notes: data.notes || 'Roll close',
      },
      {
        position_id: positionId,
        type: 'roll_open' as const,
        strike: data.newStrike,
        expiration: data.newExpiration,
        premium_collected: data.newCredit,
        premium_paid: 0,
        notes: data.notes || 'Roll open',
      },
    ])

    await get().fetchPositions()
  },

  // ── Monthly Income ────────────────────────────────────
  fetchMonthlyIncome: async () => {
    const { user, positions } = get()
    if (!user) return

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let totalCollected = 0
    let totalLosses = 0
    const closedTrades: MonthlyIncome['closedTrades'] = []

    for (const pos of positions) {
      if (pos.status === 'closed' && pos.closed_at) {
        const closedDate = new Date(pos.closed_at)
        if (closedDate >= monthStart) {
          let posCollected = 0
          let posPaid = 0
          for (const leg of pos.legs) {
            posCollected += Number(leg.premium_collected) || 0
            posPaid += Number(leg.premium_paid) || 0
          }
          totalCollected += posCollected
          totalLosses += posPaid
          closedTrades.push({
            ticker: pos.ticker,
            type: pos.type,
            premium: posCollected - posPaid,
            closedAt: pos.closed_at,
          })
        }
      }
    }

    set({
      monthlyIncome: {
        totalCollected,
        totalLosses,
        netPremium: totalCollected - totalLosses,
        closedTrades,
      },
    })
  },
}))
