import React, { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** "+919876543210" -> "98xxxxx210" — keep first 2 and last 3 digits. */
function maskPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length <= 5) return digits.replace(/./g, 'x');
  const head = digits.slice(0, 2);
  const tail = digits.slice(-3);
  const masked = 'x'.repeat(digits.length - 5);
  return `${head}${masked}${tail}`;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Reads the classifier's reason string and buckets it into one of the
 * three escalation causes it can actually produce for a RED-zone message,
 * so the card's left-border accent tells the reviewer *why* at a glance,
 * before they read a word of the message.
 */
function classifyReason(reason) {
  const text = (reason || '').toLowerCase();

  if (text.includes('money-moving') || text.includes('refund') || text.includes('replacement') || text.includes('cancellation')) {
    return { tone: 'red', label: 'Money on the line' };
  }
  if (text.includes('angry') || text.includes('frustrat') || text.includes('tone')) {
    return { tone: 'amber', label: 'Tone check needed' };
  }
  return { tone: 'green', label: 'Missing info' };
}

const ACCENT_STYLES = {
  red: { border: 'border-l-rose-400', chip: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
  amber: { border: 'border-l-amber-400', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  green: { border: 'border-l-emerald-400', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
};

// In production (e.g. deployed to Vercel) there's no dev-server proxy to
// rewrite '/api/...' to the backend's real origin — that proxy only exists
// while running `vite dev` locally. Every environment needs an explicit
// base URL instead. Set VITE_API_BASE_URL at build time (Vercel: Project
// Settings -> Environment Variables); locally it falls back to the same
// backend port vite.config.js's dev proxy already points at.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------------
// Stat pill
// ---------------------------------------------------------------------

function StatPill({ label, value }) {
  return (
    <div className="flex flex-col items-start rounded-xl bg-white px-4 py-2.5 shadow-card ring-1 ring-slate-900/5 min-w-[136px]">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-lg font-semibold text-slate-800 tabular-nums">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Approval card
// ---------------------------------------------------------------------

function ApprovalCard({ approval, onResolved }) {
  const [value, setValue] = useState(approval.draftResponse || '');
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const { tone, label } = classifyReason(approval.reason);
  const accent = ACCENT_STYLES[tone];

  const send = async (editedResponse) => {
    setSending(true);
    setError(null);
    try {
      await apiPost(`/api/approvals/${approval.id}/approve`, editedResponse ? { editedResponse } : {});
      onResolved(approval.id);
    } catch (err) {
      setError('Could not send — try again.');
      setSending(false);
    }
  };

  const handleApproveAndSend = () => send(undefined);

  const handleEditAndSend = () => {
    if (!editing) {
      setEditing(true);
      return;
    }
    send(value);
  };

  return (
    <div className={`rounded-2xl bg-white shadow-card ring-1 ring-slate-900/5 border-l-4 ${accent.border} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-500">{maskPhone(approval.phone)}</span>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${accent.chip}`}>
          {label}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Customer said</p>
        <p className="text-sm text-slate-700 leading-relaxed">{approval.customerMessage}</p>
      </div>

      <div className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Saathi's draft reply</p>
        <textarea
          className={`draft-field w-full text-sm leading-relaxed rounded-lg border p-3 resize-y min-h-[84px] ${
            editing
              ? 'bg-white border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={!editing}
          disabled={sending}
        />
      </div>

      <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">Why it's here: </span>
          {approval.reason}
        </p>
      </div>

      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApproveAndSend}
          disabled={sending}
          className="flex-1 rounded-lg bg-brand-500 text-white text-sm font-medium py-2 hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending && !editing ? 'Sending…' : 'Approve & send'}
        </button>
        <button
          type="button"
          onClick={handleEditAndSend}
          disabled={sending}
          className="flex-1 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium py-2 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending && editing ? 'Sending…' : editing ? 'Send edited reply' : 'Edit & send'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// App
// ---------------------------------------------------------------------

export default function App() {
  const [approvals, setApprovals] = useState([]);
  const [stats, setStats] = useState({ autoResolvedToday: 0, escalatedToday: 0, avgResponseTimeMs: 0 });
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const removedIds = useRef(new Set());

  const refresh = useCallback(async () => {
    try {
      const [approvalsRes, statsRes] = await Promise.all([
        apiGet('/api/approvals'),
        apiGet('/api/stats'),
      ]);
      const incoming = (approvalsRes.approvals || []).filter((a) => !removedIds.current.has(a.id));
      setApprovals(incoming);
      setStats(statsRes);
      setOffline(false);
    } catch (err) {
      setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleResolved = (id) => {
    removedIds.current.add(id);
    setApprovals((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="live-dot h-2 w-2 rounded-full bg-emerald-500" />
            <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
              Saathi <span className="text-slate-400 font-normal">— approval queue</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatPill label="Auto-resolved today" value={stats.autoResolvedToday} />
            <StatPill label="Escalated today" value={stats.escalatedToday} />
            <StatPill label="Avg response time" value={formatDuration(stats.avgResponseTimeMs)} />
          </div>
        </header>

        {offline && (
          <div className="mb-6 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-700">
            Can't reach the backend right now — retrying every few seconds.
          </div>
        )}

        {!loaded ? (
          <div className="text-sm text-slate-400 py-16 text-center">Loading queue…</div>
        ) : approvals.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-card ring-1 ring-slate-900/5 py-16 text-center">
            <p className="text-slate-500 text-sm">Queue is empty — nothing waiting on you right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} onResolved={handleResolved} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
