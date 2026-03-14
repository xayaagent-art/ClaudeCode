import type { User, PositionWithLegs } from './types'

const DEMO_USER: User = {
  id: 'demo-user',
  email: 'demo@thetawheel.app',
  name: 'Yash',
  portfolio_size: 100000,
  monthly_target: 3750,
  created_at: new Date().toISOString(),
}

function seedPositions(): PositionWithLegs[] {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const future = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    return fmt(d)
  }
  const past = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }

  return [
    {
      id: 'pos-1',
      user_id: 'demo-user',
      ticker: 'AAPL',
      type: 'CSP',
      thesis: 'Strong earnings, want to own at $180',
      conviction: 'high',
      status: 'open',
      created_at: past(12),
      closed_at: null,
      legs: [
        {
          id: 'leg-1',
          position_id: 'pos-1',
          type: 'open',
          strike: 185,
          expiration: future(18),
          premium_collected: 3.20,
          premium_paid: 0,
          delta: 0.28,
          iv_rank: 42,
          filled_at: past(12),
          notes: null,
        },
      ],
    },
    {
      id: 'pos-2',
      user_id: 'demo-user',
      ticker: 'AMD',
      type: 'CSP',
      thesis: 'AI tailwinds, accumulating shares',
      conviction: 'high',
      status: 'open',
      created_at: past(25),
      closed_at: null,
      legs: [
        {
          id: 'leg-2a',
          position_id: 'pos-2',
          type: 'open',
          strike: 155,
          expiration: past(5).split('T')[0],
          premium_collected: 4.10,
          premium_paid: 0,
          delta: 0.30,
          iv_rank: 55,
          filled_at: past(25),
          notes: null,
        },
        {
          id: 'leg-2b',
          position_id: 'pos-2',
          type: 'roll_close',
          strike: 155,
          expiration: past(5).split('T')[0],
          premium_collected: 0,
          premium_paid: 2.80,
          delta: null,
          iv_rank: null,
          filled_at: past(5),
          notes: 'Rolled down and out',
        },
        {
          id: 'leg-2c',
          position_id: 'pos-2',
          type: 'roll_open',
          strike: 150,
          expiration: future(25),
          premium_collected: 3.50,
          premium_paid: 0,
          delta: 0.25,
          iv_rank: 48,
          filled_at: past(5),
          notes: 'Rolled down and out',
        },
      ],
    },
    {
      id: 'pos-3',
      user_id: 'demo-user',
      ticker: 'MSFT',
      type: 'CC',
      thesis: 'Selling calls against 100 shares',
      conviction: 'medium',
      status: 'open',
      created_at: past(8),
      closed_at: null,
      legs: [
        {
          id: 'leg-3',
          position_id: 'pos-3',
          type: 'open',
          strike: 430,
          expiration: future(12),
          premium_collected: 5.40,
          premium_paid: 0,
          delta: 0.22,
          iv_rank: 38,
          filled_at: past(8),
          notes: null,
        },
      ],
    },
    {
      id: 'pos-4',
      user_id: 'demo-user',
      ticker: 'NVDA',
      type: 'CSP',
      thesis: 'Post-earnings dip, high IV',
      conviction: 'medium',
      status: 'open',
      created_at: past(3),
      closed_at: null,
      legs: [
        {
          id: 'leg-4',
          position_id: 'pos-4',
          type: 'open',
          strike: 850,
          expiration: future(32),
          premium_collected: 18.50,
          premium_paid: 0,
          delta: 0.20,
          iv_rank: 72,
          filled_at: past(3),
          notes: null,
        },
      ],
    },
    {
      id: 'pos-5',
      user_id: 'demo-user',
      ticker: 'TSLA',
      type: 'CSP',
      thesis: null,
      conviction: 'low',
      status: 'closed',
      created_at: past(30),
      closed_at: past(10),
      legs: [
        {
          id: 'leg-5a',
          position_id: 'pos-5',
          type: 'open',
          strike: 240,
          expiration: past(10).split('T')[0],
          premium_collected: 6.00,
          premium_paid: 0,
          delta: 0.30,
          iv_rank: 65,
          filled_at: past(30),
          notes: null,
        },
        {
          id: 'leg-5b',
          position_id: 'pos-5',
          type: 'close',
          strike: 240,
          expiration: past(10).split('T')[0],
          premium_collected: 0,
          premium_paid: 1.20,
          delta: null,
          iv_rank: null,
          filled_at: past(10),
          notes: 'Closed at 80% profit',
        },
      ],
    },
    {
      id: 'pos-6',
      user_id: 'demo-user',
      ticker: 'SPY',
      type: 'CSP',
      thesis: 'Index play, safe income',
      conviction: 'high',
      status: 'closed',
      created_at: past(20),
      closed_at: past(7),
      legs: [
        {
          id: 'leg-6a',
          position_id: 'pos-6',
          type: 'open',
          strike: 520,
          expiration: past(7).split('T')[0],
          premium_collected: 4.50,
          premium_paid: 0,
          delta: 0.18,
          iv_rank: 30,
          filled_at: past(20),
          notes: null,
        },
        {
          id: 'leg-6b',
          position_id: 'pos-6',
          type: 'close',
          strike: 520,
          expiration: past(7).split('T')[0],
          premium_collected: 0,
          premium_paid: 0.50,
          delta: null,
          iv_rank: null,
          filled_at: past(7),
          notes: 'Closed at ~90% profit',
        },
      ],
    },
  ]
}

const STORAGE_KEY = 'thetawheel_demo'

interface DemoData {
  user: User
  positions: PositionWithLegs[]
}

function loadDemo(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as DemoData
      if (data.user && data.positions) return data
    }
  } catch { /* ignore */ }

  const data: DemoData = {
    user: DEMO_USER,
    positions: seedPositions(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  return data
}

function saveDemo(data: DemoData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function isDemoMode(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || ''
  return !url || url === 'NA' || url === 'na' || url === 'none' || !url.startsWith('http')
}

export function getDemoUser(): User {
  return loadDemo().user
}

export function getDemoPositions(): PositionWithLegs[] {
  return loadDemo().positions
}

export function saveDemoPositions(positions: PositionWithLegs[]) {
  const data = loadDemo()
  data.positions = positions
  saveDemo(data)
}

export function generateId(): string {
  return 'demo-' + Math.random().toString(36).slice(2, 11)
}
