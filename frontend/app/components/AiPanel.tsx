'use client';

import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { apiGet } from '../lib/api';
import type { AiStatus, Alert, Analysis, Tone } from '../lib/types';
import { AnalysisView } from './AnalysisView';
import { Badge, Card, useNow } from './ui';

const STATE_TONE: Record<AiStatus['state'], Tone> = { ok: 'ok', degraded: 'warn', disabled: 'muted', untested: 'info' };
const STATE_LABEL: Record<AiStatus['state'], string> = { ok: 'AI online', degraded: 'AI degraded', disabled: 'Rules only', untested: 'AI ready' };

export function AiPanel({
  ai,
  openAlerts,
  analyses,
  refreshKey,
}: {
  ai: AiStatus | null;
  openAlerts: Alert[];
  analyses: Record<string, Analysis>;
  refreshKey: number;
}) {
  const now = useNow(5000);
  const focus = [...openAlerts].filter((a) => typeof a.id === 'number').sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))[0];
  const focusId = focus?.id;
  const [fetched, setFetched] = useState<Analysis | null>(null);

  useEffect(() => {
    if (typeof focusId !== 'number') return;
    const controller = new AbortController();
    apiGet<{ analyses: Analysis[] }>(`/api/alerts/${focusId}`, controller.signal)
      .then((d) => setFetched(d.analyses[0] ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [focusId, refreshKey]);

  const analysis = focus ? (analyses[String(focus.id)] ?? (fetched && fetched.alert_id === focus.id ? fetched : null)) : null;

  return (
    <Card title="Incident analysis" icon={<Brain size={14} />} right={ai && <Badge tone={STATE_TONE[ai.state]} title={ai.reason ?? undefined}>{STATE_LABEL[ai.state]}</Badge>}>
      {!focus ? (
        <div className="space-y-2 text-sm text-slate-400">
          <p className="text-emerald-300">No active incidents.</p>
          <p className="text-[12px] leading-relaxed text-slate-500">
            Analysis runs only when a critical alert opens, and it only sees measured metrics. {ai?.state === 'disabled' ? `AI is off (${ai.reason ?? 'not configured'}), so a deterministic rule-based analysis is used.` : 'Answers that cite numbers not present in the evidence are rejected.'}
          </p>
        </div>
      ) : analysis ? (
        <div>
          <p className="mb-2 text-[11px] text-slate-500">For: <span className="text-slate-300">{focus.title}</span></p>
          <AnalysisView analysis={analysis} now={now} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">Analysing “{focus.title}”… Warnings are not analysed automatically; open the alert to analyse it on demand.</p>
      )}
    </Card>
  );
}
