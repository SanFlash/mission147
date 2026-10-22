import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  Activity, AlarmClock, ArrowDownRight, ArrowRight, BookOpen, CalendarDays,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Command,
  LayoutDashboard, ListTodo, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Target, TrendingUp, X,
} from 'lucide-react'

type Subject = { id: number; name: string; color: string; description?: string }
type Revision = {
  id: number; topic_id: number; stage: number; offset_days: number; scheduled_date: string
  scheduled_time: string; status: string; topic_title: string; subject_name: string
  estimated_minutes: number; confidence?: number | null
}
type Topic = {
  id: number; title: string; subject_id: number; subject_name: string; original_study_date: string
  priority: string; difficulty: number; estimated_minutes: number; tags: string[]
  subtopics: { id: number; title: string; completed_at?: string | null }[]
  revisions: Revision[]; revision_offsets: number[]
}
type View = 'Overview' | 'My topics' | "Today's revision" | 'Calendar' | 'Settings'

const todayISO = () => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
const prettyDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const prettyLongDate = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase()

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`)
  return body as T
}

export default function App() {
  const [view, setView] = useState<View>('Overview')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showTopicForm, setShowTopicForm] = useState(false)
  const [showSubjectForm, setShowSubjectForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subjectName, setSubjectName] = useState('')
  const [topicTitle, setTopicTitle] = useState('')
  const [topicSubject, setTopicSubject] = useState('')
  const [studyDate, setStudyDate] = useState(todayISO())
  const [subtopicsText, setSubtopicsText] = useState('')
  const [priority, setPriority] = useState('medium')
  const [duration, setDuration] = useState('30')
  const [offsetsText, setOffsetsText] = useState('1, 4, 7')
  const [filterSubject, setFilterSubject] = useState('all')
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const [s, t, r] = await Promise.all([
        api<Subject[]>('/api/subjects'),
        api<Topic[]>('/api/topics'),
        api<Revision[]>(`/api/revisions?date=${todayISO()}`),
      ])
      setSubjects(s); setTopics(t); setRevisions(r)
      setTopicSubject(current => current || (s[0] ? String(s[0].id) : ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Mission147 data.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!rootRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo('.animate-in', { y: 12, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.48, stagger: 0.055, ease: 'power2.out', clearProps: 'all',
      })
    }, rootRef)
    return () => ctx.revert()
  }, [view, loading])

  const filteredTopics = useMemo(() => topics.filter(t =>
    (filterSubject === 'all' || String(t.subject_id) === filterSubject) &&
    (t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.subject_name.toLowerCase().includes(search.toLowerCase()) ||
      t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()))),
  ), [topics, search, filterSubject])

  const dueToday = revisions.filter(r => r.scheduled_date === todayISO())
  const overdue = revisions.filter(r => r.scheduled_date < todayISO())
  const completed = topics.reduce((n, t) => n + t.revisions.filter(r => r.status === 'completed').length, 0)
  const allSessions = topics.reduce((n, t) => n + t.revisions.length, 0)
  const completionRate = allSessions ? Math.round(completed / allSessions * 100) : 0
  const totalSubtopics = topics.reduce((n, t) => n + t.subtopics.length, 0)
  const activeCycle = topics.filter(t => t.revisions.some(r => r.status === 'scheduled' || r.status === 'snoozed')).length

  async function createSubject(e: FormEvent) {
    e.preventDefault(); if (!subjectName.trim()) return
    setSaving(true); setError('')
    try {
      const subject = await api<Subject>('/api/subjects', { method: 'POST', body: JSON.stringify({ name: subjectName.trim() }) })
      setSubjects(old => [...old, subject]); setTopicSubject(String(subject.id)); setSubjectName('')
      setShowSubjectForm(false); setNotice('Subject created successfully.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create subject.') }
    finally { setSaving(false) }
  }

  async function createTopic(e: FormEvent) {
    e.preventDefault()
    if (!topicTitle.trim() || !topicSubject) { setError('Add a topic title and create/select a subject first.'); return }
    const offsets = offsetsText.split(',').map(v => Number(v.trim()))
    if (!offsets.length || offsets.some(v => !Number.isInteger(v) || v < 1 || v > 3650)) {
      setError('Revision intervals must be whole numbers between 1 and 3650.'); return
    }
    setSaving(true); setError('')
    try {
      await api('/api/topics', { method: 'POST', body: JSON.stringify({
        title: topicTitle.trim(), subject_id: Number(topicSubject), original_study_date: studyDate,
        subtopics: subtopicsText.split('\n').map(v => v.trim()).filter(Boolean),
        priority, estimated_minutes: Number(duration), revision_offsets: offsets,
      }) })
      setTopicTitle(''); setSubtopicsText(''); setPriority('medium'); setDuration('30')
      setShowTopicForm(false); setNotice('Topic saved. Your revision dates are scheduled.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create topic.') }
    finally { setSaving(false) }
  }

  async function updateRevision(revision: Revision, status: 'completed' | 'skipped') {
    try {
      await api(`/api/revisions/${revision.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice(status === 'completed' ? `“${revision.topic_title}” marked complete.` : 'Revision skipped.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update revision.') }
  }

  const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
    { label: 'Overview', icon: LayoutDashboard }, { label: 'My topics', icon: BookOpen },
    { label: "Today's revision", icon: ListTodo }, { label: 'Calendar', icon: CalendarDays },
    { label: 'Settings', icon: Settings2 },
  ]

  return <div className="app-shell" ref={rootRef}>
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Command size={21} strokeWidth={2.4} /></div>
        <div><div className="brand-name">mission<span>147</span></div><div className="brand-caption">YOUR LEARNING SYSTEM</div></div>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map(item => {
          const Icon = item.icon
          return <button key={item.label} className={`nav-item ${view === item.label ? 'active' : ''}`} onClick={() => setView(item.label)}>
            <Icon size={18} /><span>{item.label}</span>
            {item.label === "Today's revision" && dueToday.length > 0 && <span className="nav-count">{dueToday.length}</span>}
          </button>
        })}
      </nav>
      <div className="sidebar-divider" />
      <div className="workspace-label">YOUR SUBJECTS <button className="tiny-icon" onClick={() => setShowSubjectForm(true)} aria-label="Add subject"><Plus size={15}/></button></div>
      <div className="subject-list">
        {subjects.slice(0, 7).map((s, i) => <button className="subject-item" key={s.id} onClick={() => { setFilterSubject(String(s.id)); setView('My topics') }}>
          <span className="subject-dot" style={{ background: ['#9a8cff','#61c6a3','#e7b36b','#e67e9a','#6bb4e8','#c18ce8','#a8b47a'][i % 7] }} />
          <span>{s.name}</span><span className="subject-total">{topics.filter(t => t.subject_id === s.id).length}</span>
        </button>)}
        {subjects.length === 0 && <p className="sidebar-empty">Your subjects will appear here.</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-card"><ShieldCheck size={17}/><div><strong>Private by default</strong><span>Your study data stays local.</span></div></div>
        <div className="profile-row"><div className="avatar">M</div><div className="profile-copy"><strong>My learning space</strong><span>Personal workspace</span></div><ChevronDown size={15} className="muted"/></div>
      </div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{view}</strong></div>
        <div className="top-actions">
          <label className="search-box"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..." aria-label="Search topics"/><kbd>⌘ K</kbd></label>
          <button className="icon-button" title="Settings" onClick={() => setView('Settings')}><Settings2 size={18}/></button>
          <button className="primary-button top-add" onClick={() => setShowTopicForm(true)}><Plus size={17}/> Add topic</button>
        </div>
      </header>

      <div className="content">
        {error && <div className="alert error-alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {notice && <div className="alert success-alert"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16}/></button></div>}
        {loading ? <div className="loading-panel"><div className="spinner"/><p>Preparing your learning space…</p></div> : <>
          {view === 'Overview' && <Overview
            dueToday={dueToday} overdue={overdue} topics={topics} activeCycle={activeCycle}
            completed={completed} totalSessions={allSessions} completionRate={completionRate}
            totalSubtopics={totalSubtopics} onAdd={() => setShowTopicForm(true)}
            onNavigate={setView} onComplete={updateRevision} />
          }
          {view === 'My topics' && <TopicsView topics={filteredTopics} subjects={subjects} filterSubject={filterSubject} setFilterSubject={setFilterSubject} onAdd={() => setShowTopicForm(true)} />}
          {view === "Today's revision" && <RevisionView revisions={revisions} onComplete={updateRevision} />}
          {view === 'Calendar' && <CalendarView topics={topics} />}
          {view === 'Settings' && <SettingsView subjects={subjects.length} topics={topics.length} />}
        </>}
      </div>
      <footer className="footer"><span>MISSION147 <span className="footer-dot">•</span> REVISION OS</span><span><ShieldCheck size={13}/> Local-first learning · Your data stays on this device</span></footer>
    </main>

    {showTopicForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowTopicForm(false) }}>
      <form className="modal-card" onSubmit={createTopic}>
        <div className="modal-head"><div><div className="eyebrow">BUILD YOUR MEMORY</div><h2>Add a new topic</h2><p>We’ll create your revision timeline automatically.</p></div><button type="button" className="icon-button" onClick={() => setShowTopicForm(false)} aria-label="Close"><X size={18}/></button></div>
        <label className="field-label">Topic name<input required maxLength={240} value={topicTitle} onChange={e => setTopicTitle(e.target.value)} placeholder="e.g. Photosynthesis" autoFocus /></label>
        <div className="field-grid"><label className="field-label">Subject<select required value={topicSubject} onChange={e => setTopicSubject(e.target.value)}><option value="">Choose subject</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="field-label">Initial study date<input type="date" required value={studyDate} onChange={e => setStudyDate(e.target.value)}/></label></div>
        {subjects.length === 0 && <button type="button" className="text-action" onClick={() => setShowSubjectForm(true)}>+ Create your first subject</button>}
        <label className="field-label">Subtopics <span className="optional">optional · one per line</span><textarea value={subtopicsText} onChange={e => setSubtopicsText(e.target.value)} rows={3} placeholder={'Light-dependent reactions\nCalvin cycle\nChlorophyll'} /></label>
        <div className="field-grid"><label className="field-label">Priority<select value={priority} onChange={e => setPriority(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="field-label">Estimated revision time<select value={duration} onChange={e => setDuration(e.target.value)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label></div>
        <label className="field-label">Revision days <span className="optional">days after initial study</span><input value={offsetsText} onChange={e => setOffsetsText(e.target.value)} placeholder="1, 4, 7, 14, 30" required /></label>
        <div className="schedule-preview"><div className="preview-title"><CalendarDays size={15}/> YOUR REVISION TIMELINE</div><div className="preview-steps">{offsetsText.split(',').map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v > 0 && v <= 3650).sort((a,b) => a-b).map((offset, i) => {
          const d = new Date(studyDate + 'T12:00:00'); d.setDate(d.getDate() + offset)
          return <div className="preview-step" key={offset}><span className="step-number">{i + 1}</span><div><strong>Day {offset}</strong><span>{d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div></div>
        })}</div></div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowTopicForm(false)}>Cancel</button><button className="primary-button" disabled={saving || !subjects.length}><Plus size={16}/>{saving ? 'Saving…' : 'Save topic & schedule'}</button></div>
      </form>
    </div>}

    {showSubjectForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowSubjectForm(false) }}>
      <form className="modal-card compact-modal" onSubmit={createSubject}>
        <div className="modal-head"><div><div className="eyebrow">ORGANIZE YOUR LEARNING</div><h2>Create a subject</h2><p>Group related topics in one place.</p></div><button type="button" className="icon-button" onClick={() => setShowSubjectForm(false)} aria-label="Close"><X size={18}/></button></div>
        <label className="field-label">Subject name<input autoFocus required maxLength={120} value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Biology, History, JavaScript"/></label>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowSubjectForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Create subject'}</button></div>
      </form>
    </div>}
  </div>
}

function Overview(props: {
  dueToday: Revision[]; overdue: Revision[]; topics: Topic[]; activeCycle: number; completed: number
  totalSessions: number; completionRate: number; totalSubtopics: number; onAdd: () => void
  onNavigate: (v: View) => void; onComplete: (r: Revision, status: 'completed' | 'skipped') => void
}) {
  const { dueToday, overdue, topics, activeCycle, completed, totalSessions, completionRate, totalSubtopics, onAdd, onNavigate, onComplete } = props
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  return <div className="page-stack">
    <section className="welcome-row animate-in"><div><div className="eyebrow"><Sparkles size={13}/> YOUR DAILY MOMENTUM</div><h1>{greeting}, learner<span className="period">.</span></h1><p>{prettyLongDate(new Date())} <span className="subtle-separator">·</span> Small sessions. Stronger recall.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17}/> Add a topic</button></section>
    <section className="hero-card animate-in"><div className="hero-copy"><div className="hero-tag"><span className="pulse-dot"/> YOUR 1–4–7 METHOD</div><h2>Learn it today.<br/><span>Remember it longer.</span></h2><p>Turn learning into a habit with a revision plan that knows what’s next.</p><button className="hero-button" onClick={() => onNavigate("Today's revision")}>Open revision queue <ArrowRight size={16}/></button></div><div className="hero-graphic" aria-label="Day 0, Day 1, Day 4, Day 7 revision cycle"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-center"><Target size={29}/><span>RECALL</span></div><div className="orbit-node node-zero"><span>0</span><small>LEARN</small></div><div className="orbit-node node-one"><span>1</span><small>REVIEW</small></div><div className="orbit-node node-four"><span>4</span><small>REVIEW</small></div><div className="orbit-node node-seven"><span>7</span><small>REVIEW</small></div></div><div className="hero-glow"/></section>
    <section className="stats-grid animate-in">
      <StatCard label="Active topics" value={String(activeCycle)} caption="In a revision cycle" icon={BookOpen} tone="violet" trend={`${topics.length} total topics`}/>
      <StatCard label="Due today" value={String(dueToday.length)} caption="Ready for recall" icon={AlarmClock} tone="amber" trend={dueToday.length ? 'Your next action' : 'You’re all caught up'}/>
      <StatCard label="Completed reviews" value={String(completed)} caption="Sessions finished" icon={CheckCircle2} tone="green" trend={`${totalSessions} scheduled sessions`}/>
      <StatCard label="Recall progress" value={`${completionRate}%`} caption="Completion rate" icon={TrendingUp} tone="blue" trend={totalSessions ? 'Based on saved sessions' : 'Start your first topic'}/>
    </section>
    <section className="dashboard-grid">
      <div className="panel today-panel animate-in"><div className="panel-heading"><div><div className="eyebrow">STAY ON TRACK</div><h3>Today's revision</h3><p>Your next steps, all in one place.</p></div><button className="quiet-link" onClick={() => onNavigate("Today's revision")}>View all <ArrowRight size={14}/></button></div>
        {dueToday.length === 0 ? <EmptyState icon={CheckCircle2} title={overdue.length ? 'Today is clear' : 'A fresh start'} text={overdue.length ? `You have ${overdue.length} overdue session(s) to catch up on.` : 'No revisions due today. Add a topic and your plan starts here.'} action={overdue.length ? 'Open revision queue' : 'Add first topic'} onAction={overdue.length ? () => onNavigate("Today's revision") : onAdd}/> :
          <div className="revision-list">{dueToday.slice(0, 4).map(r => <RevisionRow key={r.id} revision={r} onComplete={onComplete}/>)}</div>}
        {dueToday.length > 0 && <button className="full-width-action" onClick={() => onNavigate("Today's revision")}>Continue your revision <ArrowRight size={15}/></button>}
      </div>
      <div className="panel progress-panel animate-in"><div className="panel-heading"><div><div className="eyebrow">YOUR CONSISTENCY</div><h3>Learning overview</h3><p>A snapshot of your workspace.</p></div><Activity size={19} className="panel-icon"/></div>
        <div className="progress-ring-wrap"><div className="progress-ring" style={{background:`conic-gradient(#a49aff ${completionRate * 3.6}deg, #2a2d3a 0deg)`}}><div className="progress-ring-inner"><strong>{completionRate}%</strong><span>COMPLETE</span></div></div><div className="progress-ring-copy"><strong>{completed} <span>of {totalSessions}</span></strong><p>revision sessions completed</p><div className="mini-legend"><span><i className="legend-dot purple"/> Completed</span><span><i className="legend-dot gray"/> Remaining</span></div></div></div>
        <div className="overview-metrics"><div><span>Topics saved</span><strong>{topics.length}</strong></div><div><span>Subtopics</span><strong>{totalSubtopics}</strong></div><div><span>Needs attention</span><strong className={overdue.length ? 'warning-text' : ''}>{overdue.length}</strong></div></div>
      </div>
    </section>
    <section className="panel topics-panel animate-in"><div className="panel-heading"><div><div className="eyebrow">YOUR LEARNING LIBRARY</div><h3>Recently added topics</h3><p>Every topic gets its own revision timeline.</p></div><button className="quiet-link" onClick={() => onNavigate('My topics')}>All topics <ArrowRight size={14}/></button></div>
      {topics.length === 0 ? <EmptyState icon={BookOpen} title="Your knowledge starts here" text="Create a subject, add a topic and let Mission147 schedule your revisions." action="Create your first topic" onAction={onAdd}/> :
        <div className="topic-table"><div className="table-head"><span>TOPIC</span><span>SUBJECT</span><span>STUDIED</span><span>REVISION PLAN</span><span>STATUS</span></div>{topics.slice(0, 5).map((t, i) => {
          const done = t.revisions.filter(r => r.status === 'completed').length
          return <div className="table-row" key={t.id}><div className="topic-cell"><span className={`topic-icon topic-tone-${i % 4}`}><BookOpen size={16}/></span><div><strong>{t.title}</strong><span>{t.subtopics.length} subtopics · {t.estimated_minutes} min</span></div></div><span className="table-subject">{t.subject_name}</span><span className="table-date">{prettyDate(t.original_study_date)}</span><div className="plan-pills">{t.revision_offsets.map(d => <span key={d} className={t.revisions.find(r => r.offset_days === d)?.status === 'completed' ? 'done' : ''}>{d}</span>)}</div><span className={`status-pill ${done === t.revisions.length && t.revisions.length ? 'status-done' : 'status-active'}`}>{done === t.revisions.length && t.revisions.length ? 'Complete' : 'In progress'}</span></div>
        })}</div>}
    </section>
    <div className="bottom-note animate-in"><div className="note-icon"><ShieldCheck size={17}/></div><div><strong>Your learning stays yours.</strong><span>Mission147 stores your study data locally. No account or cloud sync required.</span></div><span className="note-secure">LOCAL-FIRST <Check size={13}/></span></div>
  </div>
}

function StatCard({label, value, caption, icon: Icon, tone, trend}: {label:string;value:string;caption:string;icon:typeof BookOpen;tone:string;trend:string}) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={17}/></span></div><div className="stat-value">{value}</div><div className="stat-caption">{caption}</div><div className="stat-trend"><ArrowDownRight size={14}/>{trend}</div></div>
}

function RevisionRow({revision:r,onComplete}: {revision:Revision;onComplete:(r:Revision,status:'completed'|'skipped')=>void}) {
  return <div className="revision-row"><div className="revision-time"><span>{r.scheduled_time?.slice(0,5) || '09:00'}</span><i/></div><div className="revision-main"><strong>{r.topic_title}</strong><span>{r.subject_name} <span className="middot">·</span> Day {r.offset_days} revision</span></div><span className="duration-label"><Clock3 size={13}/>{r.estimated_minutes}m</span><button className="complete-button" onClick={() => onComplete(r,'completed')} aria-label={`Complete ${r.topic_title}`}><Check size={15}/></button></div>
}

function EmptyState({icon:Icon,title,text,action,onAction}: {icon:typeof BookOpen;title:string;text:string;action:string;onAction:()=>void}) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={21}/></div><strong>{title}</strong><p>{text}</p><button className="secondary-button" onClick={onAction}>{action} <ArrowRight size={14}/></button></div>
}

function TopicsView({topics,subjects,filterSubject,setFilterSubject,onAdd}: {topics:Topic[];subjects:Subject[];filterSubject:string;setFilterSubject:(s:string)=>void;onAdd:()=>void}) {
  return <div className="page-stack"><section className="welcome-row animate-in"><div><div className="eyebrow">KNOWLEDGE LIBRARY</div><h1>My topics<span className="period">.</span></h1><p>Your learning, organized into clear revision plans.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17}/> Add topic</button></section>
    <div className="filter-row animate-in"><span>{topics.length} topics found</span><label className="filter-select">Subject <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}><option value="all">All subjects</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    {topics.length ? <div className="topic-card-grid">{topics.map(t=><article className="topic-card animate-in" key={t.id}><div className="topic-card-top"><span className="topic-icon topic-tone-0"><BookOpen size={17}/></span><span className={`priority priority-${t.priority}`}>{t.priority} priority</span></div><h3>{t.title}</h3><p className="topic-card-subject">{t.subject_name}</p><div className="topic-card-meta"><span><CalendarDays size={14}/> Learned {prettyDate(t.original_study_date)}</span><span><Clock3 size={14}/> {t.estimated_minutes} min</span></div><div className="topic-card-divider"/><span className="mini-label">REVISION MILESTONES</span><div className="plan-pills large">{t.revision_offsets.map(d=><span key={d} className={t.revisions.find(r=>r.offset_days===d)?.status==='completed'?'done':''}>{d}</span>)}</div><div className="topic-card-footer"><span>{t.subtopics.length} subtopics</span><span>{t.revisions.filter(r=>r.status==='completed').length}/{t.revisions.length} complete</span></div></article>)}</div> : <div className="panel"><EmptyState icon={BookOpen} title="No topics match" text="Try a different search or add a new topic to your library." action="Add topic" onAction={onAdd}/></div>}
  </div>
}

function RevisionView({revisions,onComplete}: {revisions:Revision[];onComplete:(r:Revision,status:'completed'|'skipped')=>void}) {
  const [date,setDate] = useState(todayISO())
  const visible = revisions.filter(r => r.scheduled_date === date || r.scheduled_date < date)
  return <div className="page-stack"><section className="welcome-row animate-in"><div><div className="eyebrow">FOCUS MODE</div><h1>Today's revision<span className="period">.</span></h1><p>One session at a time. Active recall over rereading.</p></div><label className="date-chip"><CalendarDays size={16}/><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></section>
    <div className="revision-summary animate-in"><div><span className="summary-label">SESSIONS TO REVIEW</span><strong>{visible.length}</strong><span>Due on or before {prettyDate(date)}</span></div><div><span className="summary-label">ESTIMATED TIME</span><strong>{visible.reduce((n,r)=>n+r.estimated_minutes,0)}<small> min</small></strong><span>Plan your focus time</span></div><div><span className="summary-label">YOUR APPROACH</span><strong className="summary-approach">Recall first</strong><span>Test what you remember</span></div></div>
    <div className="panel animate-in"><div className="panel-heading"><div><div className="eyebrow">REVISION QUEUE</div><h3>{date === todayISO() ? 'Ready when you are' : `Sessions · ${prettyDate(date)}`}</h3><p>Complete a session when you have reviewed the material.</p></div></div>
      {visible.length ? <div className="revision-list expanded">{visible.map(r=><div className="revision-detail-row" key={r.id}><div className="revision-stage">D{r.offset_days}</div><div className="revision-detail-main"><strong>{r.topic_title}</strong><span>{r.subject_name} · {prettyDate(r.scheduled_date)} · {r.estimated_minutes} min</span>{r.scheduled_date<date && <span className="overdue-tag">Overdue</span>}</div><div className="revision-detail-actions">{r.status==='completed'?<span className="status-pill status-done"><Check size={13}/> Completed</span>:<><button className="secondary-button small-button" onClick={()=>onComplete(r,'skipped')}>Skip</button><button className="primary-button small-button" onClick={()=>onComplete(r,'completed')}><Check size={14}/> Complete</button></>}</div></div>)}</div> : <EmptyState icon={CheckCircle2} title="No sessions in this queue" text="Enjoy the breathing room, or add a topic to plan your next revision." action="Browse topics" onAction={()=>{}}/>}
    </div><div className="info-banner"><Sparkles size={18}/><div><strong>Make recall active.</strong><span>Before checking your notes, try explaining the topic in your own words or answering a question from memory.</span></div></div>
  </div>
}

function CalendarView({topics}: {topics:Topic[]}) {
  const [month,setMonth] = useState(new Date())
  const start = new Date(month.getFullYear(),month.getMonth(),1)
  const mondayOffset = (start.getDay()+6)%7
  const days = Array.from({length: new Date(month.getFullYear(),month.getMonth()+1,0).getDate()},(_,i)=>i+1)
  const byDay = new Map<string,Revision[]>()
  topics.flatMap(t=>t.revisions).forEach(r=>byDay.set(r.scheduled_date,[...(byDay.get(r.scheduled_date)||[]),r]))
  return <div className="page-stack"><section className="welcome-row animate-in"><div><div className="eyebrow">PLAN AHEAD</div><h1>Revision calendar<span className="period">.</span></h1><p>See the learning cycles coming into focus.</p></div><div className="month-controls"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} aria-label="Previous month">‹</button><strong>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</strong><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} aria-label="Next month">›</button></div></section>
    <div className="calendar-grid animate-in">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div className="calendar-weekday" key={d}>{d}</div>)}{Array.from({length:mondayOffset},(_,i)=><div className="calendar-day empty-day" key={'e'+i}/>)}{days.map(day=>{const key=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const events=byDay.get(key)||[];return <div key={key} className={`calendar-day ${key===todayISO()?'is-today':''}`}><span className="calendar-day-num">{day}</span>{events.slice(0,3).map(ev=><div key={ev.id} className={`calendar-event ${ev.status==='completed'?'event-done':''}`} title={ev.topic_title}>D{ev.offset_days} · {ev.topic_title}</div>)}{events.length>3&&<span className="more-events">+{events.length-3} more</span>}</div>})}</div>
    <div className="info-banner"><CalendarDays size={18}/><div><strong>Calendar is built from your saved topics.</strong><span>Completed sessions are marked separately. Use the revision queue to complete or reschedule sessions.</span></div></div>
  </div>
}

function SettingsView({subjects,topics}: {subjects:number;topics:number}) {
  return <div className="page-stack"><section className="welcome-row animate-in"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Settings<span className="period">.</span></h1><p>Know where your data lives and how Mission147 works.</p></div></section>
    <div className="settings-grid animate-in"><div className="panel settings-panel"><div className="settings-icon"><ShieldCheck size={20}/></div><h3>Local-first privacy</h3><p>Mission147 uses a local SQLite database. Your study topics are not sent to a cloud service by this app.</p><div className="settings-status"><span className="green-dot"/> Local API connected when dashboard data loads</div></div><div className="panel settings-panel"><div className="settings-icon"><DatabaseIcon/></div><h3>Your learning data</h3><p>Current records in this workspace.</p><div className="settings-data"><span>Subjects<strong>{subjects}</strong></span><span>Topics<strong>{topics}</strong></span></div></div><div className="panel settings-panel"><div className="settings-icon"><AlarmClock size={20}/></div><h3>Reminder capability</h3><p>Revision dates are stored automatically. Browser and background notification delivery is not enabled in this phase.</p><span className="feature-status">Planned feature</span></div><div className="panel settings-panel"><div className="settings-icon"><Sparkles size={20}/></div><h3>1–4–7 method</h3><p>Default intervals are calculated from the original study date. Custom offsets can be set when creating a topic.</p><div className="plan-pills large"><span>1</span><span>4</span><span>7</span><span>14</span><span>30</span></div></div></div>
  </div>
}

function DatabaseIcon() { return <Activity size={20}/> }
