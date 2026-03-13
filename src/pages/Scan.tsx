export default function Scan() {
  return (
    <div className="px-4 pt-[env(safe-area-inset-top)] pb-4">
      <div className="pt-6 pb-4">
        <h1 className="text-xl font-bold">Daily Scan</h1>
        <p className="text-sm text-rh-subtext mt-1">Find new opportunities</p>
      </div>

      <div className="card flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 rounded-full bg-rh-surface flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <h2 className="text-base font-semibold mb-2">Coming Soon</h2>
        <p className="text-sm text-rh-subtext text-center max-w-xs">
          Scan for high IV rank tickers, screen for wheel candidates, and get daily watchlist alerts.
        </p>
      </div>
    </div>
  )
}
