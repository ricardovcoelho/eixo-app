// api/notify.js — chamado por um cron externo (ex: cron-job.org) a cada minuto.
// Verifica tarefas/afazeres e rotinas com horário batendo (agora ou daqui a
// LEAD_MINUTES) e dispara notificações push. Protegido por CRON_SECRET.
const { getSupabase } = require('./_supabase');
const { getWebPush } = require('./_webpush');

const LEAD_MINUTES = 15;

function pad(n) { return String(n).padStart(2, '0'); }

// Calcula data/hora "de parede" em America/Sao_Paulo para um instante dado,
// sem depender de bibliotecas externas de timezone.
function saoPauloParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short'
  });
  const parts = {};
  fmt.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // alguns runtimes retornam "24" para meia-noite
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfMonth: parseInt(parts.day, 10),
    dayOfWeek: dowMap[parts.weekday],
    hhmm: `${pad(hour)}:${parts.minute}`
  };
}

// Mesma lógica de "a rotina acontece nesta data?" usada no front-end (getEventsForDate)
function routineShowsToday(r, dt) {
  const freq = r.frequency;
  const dowList = Array.isArray(r.day_of_week)
    ? r.day_of_week
    : (r.day_of_week !== null && r.day_of_week !== undefined ? [parseInt(r.day_of_week)] : []);
  if (freq === 'daily') return true;
  if (freq === 'weekdays') return dt.dayOfWeek >= 1 && dt.dayOfWeek <= 5;
  if (freq === 'weekly') return dt.dayOfWeek === 5;
  if (freq === 'custom_day') return dowList.includes(dt.dayOfWeek);
  if (freq === 'monthly') {
    const [y, m] = dt.dateStr.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)); // último dia do mês
    while (lastDay.getUTCDay() !== 5) lastDay.setUTCDate(lastDay.getUTCDate() - 1); // última sexta
    return dt.dayOfMonth === lastDay.getUTCDate();
  }
  if (freq === 'monthly_days') return dowList.includes(dt.dayOfMonth);
  return false;
}

module.exports = async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  const debug = req.query && req.query.debug === '1';

  const now = new Date();
  const before = new Date(now.getTime() + LEAD_MINUTES * 60000);
  const nowP = saoPauloParts(now);
  const beforeP = saoPauloParts(before);

  const sb = getSupabase(); // service key — acesso total, ignora RLS (cron não tem "usuário logado")
  const results = { sent: 0, errors: [] };
  if (debug) results.debug = { now: nowP, before: beforeP };

  try {
    // ── TAREFAS / AFAZERES ────────────────────────────────────────────────
    const { data: tasks, error: tErr } = await sb
      .from('tasks')
      .select('id, name, due_date, time, time_start, done, user_id')
      .in('due_date', [nowP.dateStr, beforeP.dateStr])
      .eq('done', false);
    if (tErr) throw tErr;

    if (debug) results.debug.tasksChecked = (tasks || []).map(t => ({
      id: t.id, name: t.name, due_date: t.due_date, time: t.time, time_start: t.time_start, done: t.done
    }));

    for (const t of (tasks || [])) {
      const timeVal = t.time || t.time_start;
      if (!timeVal) continue;
      const hhmm = timeVal.substring(0, 5);
      const dueDate = (t.due_date || '').substring(0, 10);
      if (dueDate === nowP.dateStr && hhmm === nowP.hhmm) {
        await maybeNotify(sb, t.user_id, 'task', t.id, nowP.dateStr, 'exact', '⏰ ' + t.name, 'É agora!', results);
      } else if (dueDate === beforeP.dateStr && hhmm === beforeP.hhmm) {
        await maybeNotify(sb, t.user_id, 'task', t.id, beforeP.dateStr, 'before', '🔔 ' + t.name, `Em ${LEAD_MINUTES} minutos`, results);
      }
    }

    // ── ROTINAS ────────────────────────────────────────────────────────────
    const { data: routines, error: rErr } = await sb
      .from('routines')
      .select('id, name, frequency, day_of_week, time, checks, user_id');
    if (rErr) throw rErr;

    for (const r of (routines || [])) {
      if (!r.time) continue;
      const hhmm = r.time.substring(0, 5);
      const matchesNow = hhmm === nowP.hhmm && routineShowsToday(r, nowP);
      const matchesBefore = !matchesNow && hhmm === beforeP.hhmm && routineShowsToday(r, beforeP);
      if (!matchesNow && !matchesBefore) continue;

      const dt = matchesNow ? nowP : beforeP;
      const [y, m] = dt.dateStr.split('-');
      const dayKey = `day${y}-${parseInt(m, 10) - 1}-w${dt.dayOfWeek}`;
      if (r.checks && r.checks[dayKey] === true) continue; // já concluída — não incomodar

      if (matchesNow) {
        await maybeNotify(sb, r.user_id, 'routine', r.id, dt.dateStr, 'exact', '⏰ ' + r.name, 'É agora!', results);
      } else {
        await maybeNotify(sb, r.user_id, 'routine', r.id, dt.dateStr, 'before', '🔔 ' + r.name, `Em ${LEAD_MINUTES} minutos`, results);
      }
    }

    return res.status(200).json(results);
  } catch (e) {
    results.errors.push(e.message);
    return res.status(500).json(results);
  }
};

async function maybeNotify(sb, userId, itemType, itemId, fireDate, fireKind, title, body, results) {
  // Deduplicação: tenta registrar o envio; se já existir (unique constraint), não reenvia.
  const { error: dedupError } = await sb
    .from('notified_reminders')
    .insert({ user_id: userId, item_type: itemType, item_id: itemId, fire_date: fireDate, fire_kind: fireKind });
  if (dedupError) {
    if (dedupError.code === '23505') return; // já enviado antes — ok, ignora
    results.errors.push(dedupError.message);
    return;
  }

  const { data: subs, error: subErr } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (subErr) { results.errors.push(subErr.message); return; }
  if (!subs || !subs.length) return;

  const webpush = getWebPush();
  const payload = JSON.stringify({ title, body, tag: `${itemType}-${itemId}-${fireKind}` });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      results.sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Inscrição não existe mais (usuário desinstalou/limpou dados) — remove
        await sb.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        results.errors.push(err.message);
      }
    }
  }
}
