-- ThetaWheel Schema v1
-- Wheel options strategy tracker

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT DEFAULT 'Yash',
  portfolio_size DECIMAL DEFAULT 100000,
  monthly_target DECIMAL DEFAULT 3750,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Positions (trade chains)
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CSP', 'CC', 'shares')),
  thesis TEXT,
  conviction TEXT CHECK (conviction IN ('high', 'medium', 'low')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('open', 'assigned', 'closed')) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Legs (individual option contracts within a chain)
CREATE TABLE legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES positions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('open', 'roll_close', 'roll_open', 'close')),
  strike DECIMAL NOT NULL,
  expiration DATE NOT NULL,
  premium_collected DECIMAL DEFAULT 0,
  premium_paid DECIMAL DEFAULT 0,
  delta DECIMAL,
  iv_rank DECIMAL,
  filled_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Monthly Summary (computed/cached)
CREATE TABLE monthly_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  total_collected DECIMAL DEFAULT 0,
  total_losses DECIMAL DEFAULT 0,
  net_premium DECIMAL DEFAULT 0,
  target DECIMAL DEFAULT 3750,
  trades_count INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  UNIQUE(user_id, month, year)
);

-- Indexes
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_legs_position_id ON legs(position_id);
CREATE INDEX idx_legs_filled_at ON legs(filled_at);
CREATE INDEX idx_monthly_summary_user ON monthly_summary(user_id, year, month);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can read own positions" ON positions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own legs" ON legs
  FOR ALL USING (
    position_id IN (
      SELECT id FROM positions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own monthly summary" ON monthly_summary
  FOR ALL USING (auth.uid() = user_id);
