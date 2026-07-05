import { ReactNode } from "react";

// The outer physical casing of the phone
function PhoneFrame({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <div
      className={`relative w-[280px] h-[580px] rounded-[48px] border-[8px] border-[#e8e5e0] bg-white shadow-2xl overflow-hidden ${className}`}
      style={{
        boxShadow: "0 25px 50px -12px rgba(26, 26, 26, 0.25), 0 0px 15px rgba(0,0,0,0.05), inset 0 0 0 2px rgba(255,255,255,1)",
      }}
    >
      {/* Dynamic Island / Notch */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[90px] h-[24px] bg-[#1a1a1a] rounded-full z-50 flex items-center justify-end px-2">
         {/* Camera dot */}
         <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0a] border border-[#2a2a2a]" />
      </div>

      {/* Screen Content */}
      <div className="w-full h-full bg-[#f9f7f4] relative overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function InvoiceUI() {
  return (
    <div className="w-full h-full flex flex-col pt-12 px-5 pb-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="font-display text-xl font-bold text-[#1a1a1a]">Invoice #4092</h3>
          <p className="text-[10px] text-[#7a7872] uppercase tracking-wider mt-0.5">Trial Site Alpha</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#eae7e2] flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-forest opacity-80" />
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e5e0] mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-[#4caf50] animate-dot-pulse" />
          <span className="text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider">Ready for Payout</span>
        </div>
        <h2 className="text-3xl font-light text-[#1a1a1a] mb-1">$45,200.00</h2>
        <p className="text-[11px] text-[#7a7872]">Protocol 102A · 4 Patient Visits</p>
      </div>

      {/* Verification Steps */}
      <div className="flex flex-col gap-3">
        <h4 className="text-[10px] font-bold text-[#7a7872] uppercase tracking-wider mb-1">Agent Verification</h4>
        
        {[
          { label: "Contract Match", status: "Verified" },
          { label: "Visit Log Cross-check", status: "Verified" },
          { label: "Prior Payments", status: "Clear" },
        ].map((item, i) => (
          <div key={i} className="flex justify-between items-center p-3 bg-white rounded-xl border border-[#e8e5e0] shadow-sm">
            <span className="text-[11px] font-medium text-[#1a1a1a]">{item.label}</span>
            <span className="text-[10px] font-bold text-forest uppercase tracking-wider bg-[#e0efeb] px-2 py-0.5 rounded-sm">{item.status}</span>
          </div>
        ))}
      </div>

      {/* Footer Button */}
      <div className="mt-auto">
        <div className="w-full py-3.5 rounded-xl bg-forest text-white text-center text-xs font-medium shadow-md">
          Approve Payout
        </div>
      </div>
    </div>
  );
}

function DashboardUI() {
  return (
    <div className="w-full h-full flex flex-col pt-12 px-5 pb-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="font-display text-xl font-bold text-[#1a1a1a]">Overview</h3>
        <p className="text-[10px] text-[#7a7872] uppercase tracking-wider mt-0.5">Q3 Financials</p>
      </div>

      {/* Abstract Chart */}
      <div className="h-32 w-full flex items-end gap-2 mb-6">
        {[40, 70, 45, 90, 60, 100, 80].map((h, i) => (
          <div key={i} className="w-full rounded-t-sm" style={{ height: `${h}%`, backgroundColor: i === 5 ? "var(--forest)" : "#eae7e2" }} />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-[#e8e5e0]">
            <div className="w-8 h-8 rounded-full bg-[#f9f7f4]" />
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="w-24 h-2 bg-[#eae7e2] rounded-full" />
              <div className="w-16 h-1.5 bg-[#f9f7f4] rounded-full" />
            </div>
            <div className="w-12 h-2 bg-[#eae7e2] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PhoneMockups() {
  return (
    <div className="relative w-full h-[600px] flex items-center justify-center lg:justify-end">
      
      {/* Background Phone (Dashboard) */}
      <div className="absolute right-12 lg:right-32 top-8 lg:-top-4 transform scale-90 rotate-6 opacity-60 animate-float-delayed z-0">
        <PhoneFrame>
          <DashboardUI />
        </PhoneFrame>
      </div>

      {/* Foreground Phone (Invoice App) */}
      <div className="absolute right-0 lg:right-8 top-16 lg:top-8 transform -rotate-2 animate-float-slow z-10">
        <PhoneFrame>
          <InvoiceUI />
        </PhoneFrame>
      </div>

    </div>
  );
}
