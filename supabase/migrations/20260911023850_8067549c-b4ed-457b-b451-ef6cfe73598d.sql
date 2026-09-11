CREATE TABLE public.markets (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL REFERENCES public.markets(symbol) ON DELETE CASCADE,
  round_number BIGINT NOT NULL,
  start_ts TIMESTAMP WITH TIME ZONE NOT NULL,
  end_ts TIMESTAMP WITH TIME ZONE NOT NULL,
  start_price NUMERIC NOT NULL,
  end_price NUMERIC,
  outcome TEXT CHECK (outcome IN ('up','down','draw')),
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','closed','resolving','resolved')),
  settle_tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (symbol, round_number)
);

CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  symbol TEXT NOT NULL REFERENCES public.markets(symbol) ON DELETE CASCADE,
  round_number BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up','down')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost')),
  payout NUMERIC NOT NULL DEFAULT 0,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  settled_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (wallet_address, symbol, round_number)
);

CREATE INDEX idx_rounds_symbol_number ON public.rounds (symbol, round_number DESC);
CREATE INDEX idx_predictions_wallet ON public.predictions (wallet_address, created_at DESC);
CREATE INDEX idx_predictions_pending ON public.predictions (status, symbol, round_number);

GRANT ALL ON public.markets TO service_role;
GRANT ALL ON public.rounds TO service_role;
GRANT ALL ON public.predictions TO service_role;

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.markets (symbol, name, sort_order) VALUES
  ('AAPL', 'Apple Inc.', 1),
  ('TSLA', 'Tesla, Inc.', 2),
  ('NVDA', 'NVIDIA Corporation', 3),
  ('MSFT', 'Microsoft Corporation', 4),
  ('AMZN', 'Amazon.com, Inc.', 5);