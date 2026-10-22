import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import {
  Activity, AlarmClock, ArrowDownRight, ArrowRight, BookOpen, CalendarDays,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Command,
  LayoutDashboard, ListTodo, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Target, TrendingUp, X, Pencil, Trash2,
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
type View = 'Overview' | 'My topics' | "Today's revision" | 'Calendar' | 'Study toolkit' | 'Settings'

const PET_NAMES = ['Bae', 'Goddess', 'My lady', 'Love', 'Sweetie', 'Darling', 'Angel', 'Princess', 'Queen', 'Wifey', 'Sunshine', 'Honey', 'Beautiful', 'Cutie', 'Beloved', 'My heart', 'Starlight', 'Dream girl']

const todayISO = () => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
const tomorrowISO = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
const prettyDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const prettyLongDate = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'https://mission147.onrender.com'
    : '')
).replace(/\/$/, '')

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 25000)
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options, signal: controller.signal, cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const error = new Error(`Request failed (${response.status}): ${body.error || response.statusText}`)
        if (response.status < 500 && response.status !== 429) throw error
        throw error
      }
      return body as T
    } catch (error) {
      lastError = error
      const retryable = error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && /Request failed \((5\d\d|429)\)/.test(error.message))
      if (!retryable || attempt === 2) break
      // Render Free can sleep between requests; allow time for the API to wake up.
      await wait(900 * (attempt + 1))
    } finally { window.clearTimeout(timeout) }
  }
  if (lastError instanceof DOMException && lastError.name === 'AbortError')
    throw new Error('The study API is taking too long to wake up. Please retry in a moment.')
  if (lastError instanceof TypeError)
    throw new Error('Cannot reach the study API right now. Check your connection and retry; the hosted service may be waking up.')
  throw lastError instanceof Error ? lastError : new Error('Could not reach Mission147. Please retry.')
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
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
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
  const [remindersEnabled, setRemindersEnabled] = useState(() => {
    try { return window.localStorage.getItem('mission147-reminders-enabled') === 'true' } catch { return false }
  })
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const [s, t, r] = await Promise.all([
        api<Subject[]>('/api/subjects'),
        api<Topic[]>('/api/topics'),
        api<Revision[]>('/api/revisions?date=9999-12-31'),
      ])
      setSubjects(s); setTopics(t); setRevisions(r)
      setTopicSubject(current => current || (s[0] ? String(s[0].id) : ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Mission147 data.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const enableReminders = useCallback(async () => {
    if (!('Notification' in window)) {
      setNotice('This browser does not support desktop notifications. Keep Mission147 open to use in-app reminders.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      if (permission === 'granted') {
        setRemindersEnabled(true)
        window.localStorage.setItem('mission147-reminders-enabled', 'true')
        setNotice('Browser reminders enabled. Keep Mission147 open for scheduled reminder checks.')
      } else setNotice('Notifications were not allowed. You can enable them in your browser site settings.')
    } catch { setNotice('Could not request notification permission. Check your browser site settings.') }
  }, [])

  const disableReminders = useCallback(() => {
    setRemindersEnabled(false)
    try { window.localStorage.setItem('mission147-reminders-enabled', 'false') } catch { /* storage may be blocked */ }
    setNotice('Browser reminders paused.')
  }, [])

  useEffect(() => {
    if (!remindersEnabled || notificationPermission !== 'granted' || !('Notification' in window)) return
    const checkForReminders = () => {
      const now = Date.now()
      const lastSent = Number(window.localStorage.getItem('mission147-last-reminder-at') || 0)
      if (now - lastSent < 60 * 60 * 1000) return
      const pending = revisions.filter(r => (r.status === 'scheduled' || r.status === 'snoozed') && r.scheduled_date <= tomorrowISO())
      if (!pending.length) return
      const overdueCount = pending.filter(r => r.scheduled_date < todayISO()).length
      const todayCount = pending.filter(r => r.scheduled_date === todayISO()).length
      const tomorrowCount = pending.filter(r => r.scheduled_date === tomorrowISO()).length
      const detail = [overdueCount ? `${overdueCount} overdue` : '', todayCount ? `${todayCount} due today` : '', tomorrowCount ? `${tomorrowCount} coming tomorrow` : ''].filter(Boolean).join(' · ')
      try {
        new Notification('Mission147 revision reminder', {
          body: `${detail}: time for active recall. Open Mission147 to review your queue.`,
          tag: 'mission147-revision-reminder',
        })
        window.localStorage.setItem('mission147-last-reminder-at', String(now))
      } catch { /* browser may suppress notifications */ }
    }
    checkForReminders()
    const timer = window.setInterval(checkForReminders, 60 * 1000)
    return () => window.clearInterval(timer)
  }, [remindersEnabled, notificationPermission, revisions])
  useEffect(() => {
    if (!rootRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
      intro.fromTo('.animate-in',
        { y: 22, opacity: 0, filter: 'blur(5px)', scale: 0.99 },
        { y: 0, opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.68, stagger: 0.075, clearProps: 'all' })
      intro.fromTo('.eyebrow svg, .toolkit-label, .project-tour-icon, .settings-icon',
        { opacity: 0, scale: 0.55, rotation: -18 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.42, stagger: 0.035, clearProps: 'all' }, '-=0.42')
      intro.fromTo('.hero-card', { transformPerspective: 1000, rotationX: 7, rotationY: -7, z: -28, scale: 0.96 }, {
        rotationX: 0, rotationY: 0, z: 0, scale: 1, duration: 1.05,
        ease: 'elastic.out(1, 0.72)', clearProps: 'transform',
      }, '-=0.3')
      intro.fromTo('.stat-card', { rotationX: 10, rotationY: -3, z: -20, y: 18, opacity: 0, transformPerspective: 900 }, {
        rotationX: 0, rotationY: 0, z: 0, y: 0, opacity: 1, duration: 0.72, stagger: 0.085,
        ease: 'back.out(1.4)', clearProps: 'transform',
      }, '-=0.65')
      intro.fromTo('.progress-ring', { rotate: -65, scale: 0.72, opacity: 0.5 }, {
        rotate: 0, scale: 1, opacity: 1, duration: 1.05, ease: 'elastic.out(1, 0.7)', clearProps: 'transform',
      }, '-=0.6')
      intro.fromTo('.orbit-node', { scale: 0, opacity: 0, rotation: -35 }, {
        scale: 1, opacity: 1, rotation: 0, duration: 0.55, stagger: 0.08, ease: 'back.out(2)', clearProps: 'transform',
      }, '-=0.72')
      intro.fromTo('.toolkit-step-art .art-orbit', { rotation: -38, scale: 0.7, opacity: 0.2 }, {
        rotation: 0, scale: 1, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out', clearProps: 'opacity',
      }, '-=0.6')
      gsap.fromTo('.brand-mark', { scale: 0.72, rotation: -12 }, {
        scale: 1, rotation: 0, duration: 0.75, ease: 'elastic.out(1, 0.55)', clearProps: 'transform',
      })
      gsap.to('.orbit-node', { y: -5, duration: 1.8, stagger: 0.22, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.hero-visual', { y: -5, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.stat-icon', { rotation: 5, scale: 1.06, duration: 1.15, stagger: 0.12, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.art-icon', { y: -3, rotation: 4, duration: 1.4, stagger: 0.14, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.utils.toArray<HTMLElement>('.primary-button, .secondary-button, .icon-button, .nav-item').forEach(el => {
        const icon = el.querySelector('svg')
        if (!icon) return
        const enter = () => gsap.to(icon, { x: el.classList.contains('primary-button') ? 3 : 0, y: -1, rotation: el.classList.contains('icon-button') ? 8 : 0, scale: 1.08, duration: 0.2, ease: 'power2.out', overwrite: true })
        const leave = () => gsap.to(icon, { x: 0, y: 0, rotation: 0, scale: 1, duration: 0.28, ease: 'power2.out', overwrite: true })
        el.addEventListener('pointerenter', enter)
        el.addEventListener('pointerleave', leave)
        ctx.add(() => { el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave) })
      })
    }, rootRef)
    return () => ctx.revert()
  }, [view, loading])

  // Pointer-driven depth is only enabled for precise-pointer devices and always resets on exit.
  useEffect(() => {
    if (!rootRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const nodes = Array.from(rootRef.current.querySelectorAll<HTMLElement>(
      '.hero-card, .stat-card, .topic-card, .toolkit-step-card, .project-tour-panel',
    ))
    const handlers = nodes.map(node => {
      const move = (event: PointerEvent) => {
        const rect = node.getBoundingClientRect()
        const x = (event.clientX - rect.left) / rect.width - 0.5
        const y = (event.clientY - rect.top) / rect.height - 0.5
        gsap.to(node, {
          rotationY: x * 5, rotationX: y * -4, transformPerspective: 950,
          duration: 0.24, ease: 'power2.out', overwrite: true,
        })
      }
      const leave = () => gsap.to(node, {
        rotationY: 0, rotationX: 0, duration: 0.42, ease: 'elastic.out(1, 0.7)', overwrite: true,
      })
      node.addEventListener('pointermove', move)
      node.addEventListener('pointerleave', leave)
      return () => {
        node.removeEventListener('pointermove', move)
        node.removeEventListener('pointerleave', leave)
        gsap.killTweensOf(node)
      }
    })
    return () => handlers.forEach(cleanup => cleanup())
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

  function openAddTopic() {
    setEditingTopic(null); setTopicTitle(''); setSubtopicsText(''); setPriority('medium'); setDuration('30'); setOffsetsText('1, 4, 7'); setStudyDate(todayISO()); setShowTopicForm(true)
  }

  function openEditTopic(topic: Topic) {
    setEditingTopic(topic); setTopicTitle(topic.title); setTopicSubject(String(topic.subject_id)); setStudyDate(topic.original_study_date)
    setSubtopicsText(topic.subtopics.map(s => s.title).join('\\n')); setPriority(topic.priority); setDuration(String(topic.estimated_minutes))
    setOffsetsText(topic.revision_offsets.join(', ')); setError(''); setShowTopicForm(true)
  }

  async function deleteTopic(topic: Topic) {
    if (!window.confirm('Delete “' + topic.title + '” and its subtopics and revision schedule? This cannot be undone.')) return
    setError(''); setSaving(true)
    try {
      await api('/api/topics/' + topic.id, { method: 'DELETE' })
      setNotice('“' + topic.title + '” was deleted.'); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete topic.') }
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
      const payload = {
        title: topicTitle.trim(), subject_id: Number(topicSubject), original_study_date: studyDate,
        subtopics: subtopicsText.split('\\n').map(v => v.trim()).filter(Boolean),
        priority, estimated_minutes: Number(duration), revision_offsets: offsets,
      }
      if (editingTopic) {
        await api('/api/topics/' + editingTopic.id, { method: 'PATCH', body: JSON.stringify(payload) })
        setNotice('Topic updated. Your topic details and revision plan are saved.')
      } else {
        await api('/api/topics', { method: 'POST', body: JSON.stringify(payload) })
        setNotice('Topic saved. Your revision dates are scheduled.')
      }
      setTopicTitle(''); setSubtopicsText(''); setPriority('medium'); setDuration('30'); setEditingTopic(null)
      setShowTopicForm(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : (editingTopic ? 'Could not update topic.' : 'Could not create topic.')) }
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
    { label: 'Study toolkit', icon: CircleHelp }, { label: 'Settings', icon: Settings2 },
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
        <div className="privacy-card"><ShieldCheck size={17}/><div><strong>Private by default</strong><span>Your study data stays in your configured database.</span></div></div>
        <div className="profile-row"><div className="avatar">M</div><div className="profile-copy"><strong>My learning space</strong><span>Personal workspace</span></div><ChevronDown size={15} className="muted"/></div>
      </div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{view}</strong></div>
        <div className="top-actions">
          <label className="search-box"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..." aria-label="Search topics"/><kbd>⌘ K</kbd></label>
          <button className="icon-button" title="Settings" onClick={() => setView('Settings')}><Settings2 size={18}/></button>
          <button className="primary-button top-add" onClick={openAddTopic}><Plus size={17}/> Add topic</button>
        </div>
      </header>

      <div className="content">
        {error && <div className="alert error-alert"><CircleHelp size={17}/><span>{error}</span><button className="retry-action" onClick={() => { setLoading(true); void load() }}>Retry now</button><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {notice && <div className="alert success-alert"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16}/></button></div>}
        {loading ? <div className="loading-panel"><div className="spinner"/><p>Preparing your learning space…</p></div> : <>
          {view === 'Overview' && <Overview
            dueToday={dueToday} overdue={overdue} topics={topics} activeCycle={activeCycle}
            completed={completed} totalSessions={allSessions} completionRate={completionRate}
            totalSubtopics={totalSubtopics} onAdd={() => setShowTopicForm(true)}
            onNavigate={setView} onComplete={updateRevision} />
          }
          {view === 'My topics' && <TopicsView topics={filteredTopics} subjects={subjects} filterSubject={filterSubject} setFilterSubject={setFilterSubject} onAdd={openAddTopic} onEdit={openEditTopic} onDelete={deleteTopic} />}
          {view === "Today's revision" && <RevisionView revisions={revisions} onComplete={updateRevision} />}
          {view === 'Calendar' && <CalendarView topics={topics} />}
          {view === 'Study toolkit' && <ToolkitView />}
          {view === 'Settings' && <SettingsView subjects={subjects.length} topics={topics.length} remindersEnabled={remindersEnabled} notificationPermission={notificationPermission} onEnableReminders={enableReminders} onDisableReminders={disableReminders} />}
        </>}
      </div>
      <footer className="footer"><span>MISSION147 <span className="footer-dot">•</span> REVISION OS</span><span><ShieldCheck size={13}/> Your learning data stays in your configured database</span></footer>
    </main>

    {showTopicForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowTopicForm(false) }}>
      <form className="modal-card" onSubmit={createTopic}>
        <div className="modal-head"><div><div className="eyebrow">BUILD YOUR MEMORY</div><h2>{editingTopic ? 'Edit topic' : 'Add a new topic'}</h2><p>{editingTopic ? 'Update the topic details and revision timeline.' : 'We’ll create your revision timeline automatically.'}</p></div><button type="button" className="icon-button" onClick={() => setShowTopicForm(false)} aria-label="Close"><X size={18}/></button></div>
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
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowTopicForm(false)}>Cancel</button><button className="primary-button" disabled={saving || !subjects.length}>{editingTopic ? <Check size={16}/> : <Plus size={16}/>}{saving ? 'Saving…' : editingTopic ? 'Save changes' : 'Save topic & schedule'}</button></div>
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
  const [petName, setPetName] = useState('Bae')

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPetName(current => {
        const options = PET_NAMES.filter(name => name !== current)
        return options[Math.floor(Math.random() * options.length)]
      })
    }, 5000)
    return () => window.clearInterval(interval)
  }, [])
  return <div className="page-stack">
    <section className="welcome-row animate-in"><div><div className="eyebrow"><Sparkles size={13}/> YOUR DAILY MOMENTUM</div><h1>{greeting}, {petName}<span className="period">.</span></h1><p>{prettyLongDate(new Date())} <span className="subtle-separator">·</span> Small sessions. Stronger recall.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17}/> Add a topic</button></section>
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

function TopicsView({topics,subjects,filterSubject,setFilterSubject,onAdd,onEdit,onDelete}: {topics:Topic[];subjects:Subject[];filterSubject:string;setFilterSubject:(s:string)=>void;onAdd:()=>void;onEdit:(topic:Topic)=>void;onDelete:(topic:Topic)=>void}) {
  return <div className="page-stack"><section className="welcome-row animate-in"><div><div className="eyebrow">KNOWLEDGE LIBRARY</div><h1>My topics<span className="period">.</span></h1><p>Your learning, organized into clear revision plans.</p></div><button className="primary-button" onClick={onAdd}><Plus size={17}/> Add topic</button></section>
    <div className="filter-row animate-in"><span>{topics.length} topics found</span><label className="filter-select">Subject <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}><option value="all">All subjects</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    {topics.length ? <div className="topic-card-grid">{topics.map(t=><article className="topic-card animate-in" key={t.id}><div className="topic-card-top"><span className="topic-icon topic-tone-0"><BookOpen size={17}/></span><span className={`priority priority-${t.priority}`}>{t.priority} priority</span></div><h3>{t.title}</h3><p className="topic-card-subject">{t.subject_name}</p><div className="topic-card-meta"><span><CalendarDays size={14}/> Learned {prettyDate(t.original_study_date)}</span><span><Clock3 size={14}/> {t.estimated_minutes} min</span></div><div className="topic-card-divider"/><span className="mini-label">REVISION MILESTONES</span><div className="plan-pills large">{t.revision_offsets.map(d=><span key={d} className={t.revisions.find(r=>r.offset_days===d)?.status==='completed'?'done':''}>{d}</span>)}</div><div className="topic-card-footer"><span>{t.subtopics.length} subtopics</span><span>{t.revisions.filter(r=>r.status==='completed').length}/{t.revisions.length} complete</span></div><div className="topic-actions"><button type="button" className="secondary-button" onClick={()=>onEdit(t)}><Pencil size={14}/> Edit topic</button><button type="button" className="danger-button" onClick={()=>onDelete(t)}><Trash2 size={14}/> Delete</button></div></article>)}</div> : <div className="panel"><EmptyState icon={BookOpen} title="No topics match" text="Try a different search or add a new topic to your library." action="Add topic" onAction={onAdd}/></div>}
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


const TOOLKIT_STEPS = [
  { title: 'Day 0 — Learn it', kicker: 'Understand first', body: 'Study one small topic carefully. Make sure you can explain the main idea in your own words before you close your notes.', example: 'Example: learn what photosynthesis is and why plants need sunlight.', day: '0', label: 'LEARN', icon: BookOpen },
  { title: 'Day 1 — First recall', kicker: 'Retrieve from memory', body: 'The next day, try to recall the idea before opening your notes. Then check what you missed and correct it.', example: 'Example: explain photosynthesis from memory, then check the equation and key steps.', day: '1', label: 'RECALL', icon: Target },
  { title: 'Day 4 — Strengthen it', kicker: 'Repair weak spots', body: 'Return to the same topic after four days. Use a few questions or a blank-page summary to find gaps in your understanding.', example: 'Example: draw the process and label sunlight, water, carbon dioxide, glucose and oxygen.', day: '4', label: 'PRACTISE', icon: Sparkles },
  { title: 'Day 7 — Check retention', kicker: 'Make it stick', body: 'After seven days, test yourself again without looking. Mark the topic complete only after you have reviewed mistakes.', example: 'Example: answer three short questions about photosynthesis and explain the process aloud.', day: '7', label: 'RETAIN', icon: CheckCircle2 },
]


const APP_TOUR_STEPS = [
  { title: 'Start at Overview', kicker: 'YOUR HOME SCREEN', body: 'Overview is your starting point. It summarizes study activity, active topics, progress, and revision sessions that are due or overdue. Use Add a topic to begin building your plan.', example: 'First action: choose Add a topic. If you have not created a subject yet, create one first from the + control beside Your subjects.', label: 'OVERVIEW', icon: LayoutDashboard },
  { title: 'Create a subject', kicker: 'ORGANIZE YOUR MATERIAL', body: 'Subjects are broad categories such as Biology, History, Mathematics, or JavaScript. The subject list appears in the sidebar. Select a subject to filter your topics.', example: 'Example: create Biology, then use it when adding Photosynthesis and Cell Structure as topics.', label: 'SUBJECTS', icon: BookOpen },
  { title: 'Add your first topic', kicker: 'BUILD A STUDY PLAN', body: 'Choose Add topic, enter a clear topic name, select a subject, and set the date you first studied it. Subtopics are optional; priority and estimated revision time help you plan. The revision days field defaults to 1, 4, 7 and accepts custom comma-separated day offsets.', example: 'Example: topic = Photosynthesis; subject = Biology; initial study date = today; revision days = 1, 4, 7. Check the timeline preview, then select Save topic & schedule.', label: 'ADD TOPIC', icon: Plus },
  { title: 'Follow the revision queue', kicker: 'TURN A PLAN INTO ACTION', body: 'Open Today’s revision to see scheduled sessions. Choose a topic, recall what you know before opening notes, then check the material and correct gaps. Use the check action to mark a session completed or skip it when appropriate.', example: 'A completed session updates the record. Skipping is a status choice, not proof that you learned the topic—return to weak material when needed.', label: 'REVISE', icon: ListTodo },
  { title: 'Use the Calendar', kicker: 'SEE WHAT IS COMING', body: 'The Calendar view gives you a date-based overview of topic revision sessions. Use it to understand how your plan is distributed and to spot busy days.', example: 'If several revisions land on one day, split them into shorter sessions and adjust future topic offsets when creating new topics.', label: 'CALENDAR', icon: CalendarDays },
  { title: 'Learn with the Study Toolkit', kicker: 'GET HELP WHEN YOU NEED IT', body: 'The Study toolkit explains the 1–4–7 method with visuals and a worked example. Select I understood to unlock the guided method tutorial, then use Next step to move through the four revision stages.', example: 'The project walkthrough explains the app; the separate 1–4–7 tutorial teaches the revision method. You can revisit either whenever you need.', label: 'TOOLKIT', icon: CircleHelp },
  { title: 'Understand Settings and saved data', kicker: 'KNOW YOUR WORKSPACE', body: 'Settings summarizes the number of subjects and topics and explains the configured API/database setup. Revision dates are stored, but browser push/email reminders are not enabled in this version.', example: 'Important for hosted demos: the current README describes Render Free + SQLite as temporary storage. Records may be lost after restarts, spin-downs or redeploys. Use sample data until a persistent database is configured.', label: 'SETTINGS', icon: Settings2 },
]

function ToolkitView() {
  const [understood, setUnderstood] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [projectTourOpen, setProjectTourOpen] = useState(false)
  const [projectTourStep, setProjectTourStep] = useState(0)
  const [step, setStep] = useState(0)
  const current = TOOLKIT_STEPS[step]
  const StepIcon = current.icon
  const demoDateLabel = (offset: number) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + offset); return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase() }

  return <div className="page-stack toolkit-page">
    <section className="welcome-row animate-in">
      <div><div className="eyebrow"><Sparkles size={13}/> YOUR FRIENDLY LEARNING GUIDE</div><h1>Study toolkit<span className="period">.</span></h1><p>A visual, step-by-step guide to using the 1–4–7 revision method in Mission147.</p></div>
    </section>

    <section className="project-tour-panel panel animate-in">
      <div className="project-tour-heading"><div className="project-tour-icon"><CircleHelp size={21}/></div><div><span className="toolkit-label">NEW HERE? START HERE</span><h2>Complete Mission147 walkthrough</h2><p>Learn what each screen does, how to create a study plan, and how to follow your revisions from start to finish.</p></div></div>
      <div className="project-flow" aria-label="Mission147 workflow"><div><span>01</span><b>Subject</b><small>Organize</small></div><i>→</i><div><span>02</span><b>Topic</b><small>Add details</small></div><i>→</i><div><span>03</span><b>Revise</b><small>Recall</small></div><i>→</i><div><span>04</span><b>Track</b><small>Calendar</small></div></div>
      <div className="project-tour-bottom"><p><strong>7 short steps</strong><span>Plain-language explanations, examples, and practical actions for every main screen.</span></p><button className="primary-button" onClick={() => { setProjectTourStep(0); setProjectTourOpen(true) }}><BookOpen size={16}/> Start project tutorial <ArrowRight size={15}/></button></div>
    </section>
    <section className="toolkit-intro panel animate-in">
      <div className="toolkit-intro-copy"><span className="toolkit-label">THE IDEA IN ONE SENTENCE</span><h2>Learn once. Recall on a schedule. Remember for longer.</h2><p>Studying again and again in one sitting can feel familiar, but spaced revision asks your brain to retrieve the information after a gap. Use these dates as a practical guide—not a guarantee or a rigid rule.</p></div>
      <div className="toolkit-mini-visual" aria-label="Study on day zero, then revise on days one, four and seven">
        <div className="mini-visual-line"></div>
        {TOOLKIT_STEPS.map((s, i) => <div className={`mini-visual-node mini-node-${i}`} key={s.day}><span>{s.day}</span><small>{s.label}</small></div>)}
      </div>
    </section>
    <section className="toolkit-section animate-in">
      <div className="toolkit-section-head"><div><div className="eyebrow">THE VISUAL WALKTHROUGH</div><h2>Four moments. One simple habit.</h2></div><span className="toolkit-count">0 → 1 → 4 → 7</span></div>
      <div className="toolkit-step-grid">
        {TOOLKIT_STEPS.map((s, i) => { const Icon = s.icon; return <article className="toolkit-step-card" key={s.day}>
          <div className={`toolkit-step-art toolkit-art-${i}`}><div className="art-orbit"></div><div className="art-number">{s.day}</div><Icon size={22} className="art-icon"/><span className="art-caption">{s.label}</span></div>
          <div className="toolkit-step-content"><span className="toolkit-step-kicker">STEP {i + 1} · DAY {s.day}</span><h3>{s.title.split(' — ')[1]}</h3><p>{s.body}</p><div className="toolkit-example"><strong><Sparkles size={13}/> Worked example</strong><span>{s.example}</span></div></div>
        </article>})}
      </div>
    </section>
    <section className="toolkit-example-panel panel animate-in">
      <div className="toolkit-example-heading"><div className="toolkit-example-icon"><BookOpen size={20}/></div><div><span className="toolkit-label">EXAMPLE TOPIC</span><h2>Photosynthesis</h2><p>Imagine you studied this topic today.</p></div></div>
      <div className="worked-timeline">
        <div><span className="worked-day">{demoDateLabel(0)}</span><b>Day 0</b><span>Learn the concept</span></div><div><span className="worked-day">{demoDateLabel(1)}</span><b>Day 1</b><span>Recall without notes</span></div><div><span className="worked-day">{demoDateLabel(4)}</span><b>Day 4</b><span>Practise and fix gaps</span></div><div><span className="worked-day">{demoDateLabel(7)}</span><b>Day 7</b><span>Test your memory</span></div>
      </div>
      <p className="toolkit-footnote">Dates above are an illustration starting today. Your own revision dates are calculated from the date you enter when adding a topic.</p>
    </section>
    <section className="toolkit-check panel animate-in">
      <div className="toolkit-check-mark"><CheckCircle2 size={22}/></div><div className="toolkit-check-copy"><h3>Does the method make sense?</h3><p>Day 0 is the first study session. Then come short recall sessions on days 1, 4 and 7. Each review should make you retrieve the answer—not only reread it.</p></div>
      <button className={`understood-button ${understood ? 'is-understood' : ''}`} onClick={() => { setUnderstood(true); setTutorialOpen(false); setStep(0) }}><Check size={16}/>{understood ? 'I understand ✓' : 'I understood'}</button>
    </section>
    {understood && <section className="toolkit-unlocked animate-in"><div><span className="toolkit-label">READY FOR A GUIDED EXPLANATION?</span><h3>Let’s walk through a real example together.</h3><p>Open the interactive tutorial to move through each day, see what to do, and check the example.</p></div><button className="primary-button" onClick={() => { setStep(0); setTutorialOpen(true) }}><BookOpen size={16}/> Start the tutorial <ArrowRight size={16}/></button></section>}

    {projectTourOpen && <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-labelledby="project-tour-title">
      <section className="tutorial-modal project-tour-modal">
        <div className="tutorial-topline"><span className="toolkit-label">MISSION147 APP TOUR · STEP {projectTourStep + 1} OF {APP_TOUR_STEPS.length}</span><button className="icon-button" onClick={() => setProjectTourOpen(false)} aria-label="Close project tutorial"><X size={18}/></button></div>
        {(() => { const tour = APP_TOUR_STEPS[projectTourStep]; const TourIcon = tour.icon; return <><div className={'tutorial-hero project-tour-hero project-tour-hero-' + projectTourStep}><div className="tutorial-day-bubble">0{projectTourStep + 1}</div><TourIcon size={32}/><div className="tutorial-progress">{APP_TOUR_STEPS.map((s,i)=><span key={s.label} className={i <= projectTourStep ? 'progress-active' : ''}/>)}</div></div><span className="toolkit-step-kicker">{tour.kicker}</span><h2 id="project-tour-title">{tour.title}</h2><p className="tutorial-body">{tour.body}</p><div className="tutorial-example-box"><strong>What to do</strong><p>{tour.example}</p><span>Tip: use the main navigation to open the screen described here. You can reopen this walkthrough at any time from Study toolkit.</span></div></>})()}
        <div className="tutorial-actions"><button className="secondary-button" disabled={projectTourStep === 0} onClick={() => setProjectTourStep(v => Math.max(0, v - 1))}>Previous</button>{projectTourStep < APP_TOUR_STEPS.length - 1 ? <button className="primary-button" onClick={() => setProjectTourStep(v => Math.min(APP_TOUR_STEPS.length - 1, v + 1))}>Next step <ArrowRight size={15}/></button> : <button className="primary-button" onClick={() => setProjectTourOpen(false)}><Check size={15}/> Finish walkthrough</button>}</div>
      </section>
    </div>}
    {tutorialOpen && <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <section className="tutorial-modal">
        <div className="tutorial-topline"><span className="toolkit-label">GUIDED TUTORIAL · STEP {step + 1} OF {TOOLKIT_STEPS.length}</span><button className="icon-button" onClick={() => setTutorialOpen(false)} aria-label="Close tutorial"><X size={18}/></button></div>
        <div className={`tutorial-hero tutorial-hero-${step}`}><div className="tutorial-day-bubble">DAY {current.day}</div><StepIcon size={32}/><div className="tutorial-progress">{TOOLKIT_STEPS.map((s,i)=><span key={s.day} className={i <= step ? 'progress-active' : ''}/>)}</div></div>
        <span className="toolkit-step-kicker">{current.kicker}</span><h2 id="tutorial-title">{current.title}</h2><p className="tutorial-body">{current.body}</p>
        <div className="tutorial-example-box"><strong>Try this now</strong><p>{current.example}</p><span>Tip: say the answer in your own words before checking your notes.</span></div>
        <div className="tutorial-actions"><button className="secondary-button" disabled={step === 0} onClick={() => setStep(v => Math.max(0, v - 1))}>Previous</button>{step < TOOLKIT_STEPS.length - 1 ? <button className="primary-button" onClick={() => setStep(v => Math.min(TOOLKIT_STEPS.length - 1, v + 1))}>Next step <ArrowRight size={15}/></button> : <button className="primary-button" onClick={() => setTutorialOpen(false)}><Check size={15}/> Finish tutorial</button>}</div>
      </section>
    </div>}
  </div>
}

function SettingsView({subjects,topics,remindersEnabled,notificationPermission,onEnableReminders,onDisableReminders}: {
  subjects:number; topics:number; remindersEnabled:boolean; notificationPermission:NotificationPermission
  onEnableReminders:()=>void; onDisableReminders:()=>void
}) {
  return <div className="page-stack"><section className="welcome-row animate-in"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Settings<span className="period">.</span></h1><p>Know where your data lives and how Mission147 works.</p></div></section>
    <div className="settings-grid animate-in"><div className="panel settings-panel"><div className="settings-icon"><ShieldCheck size={20}/></div><h3>Deployment-aware storage</h3><p>Local development uses SQLite on your computer. A hosted deployment sends requests to your configured API and stores records in that backend's database.</p><div className="settings-status"><span className="green-dot"/> API requests retry automatically if the service is waking up</div></div><div className="panel settings-panel"><div className="settings-icon"><DatabaseIcon/></div><h3>Your learning data</h3><p>Current records in this workspace.</p><div className="settings-data"><span>Subjects<strong>{subjects}</strong></span><span>Topics<strong>{topics}</strong></span></div></div>
    <div className="panel settings-panel reminder-settings"><div className="settings-icon"><AlarmClock size={20}/></div><h3>Revision reminders</h3><p>Get a browser notification when revisions are due or overdue. Permission is controlled by your browser.</p><div className="settings-status"><span className={remindersEnabled && notificationPermission === 'granted' ? 'green-dot' : 'amber-dot'}/>{remindersEnabled && notificationPermission === 'granted' ? 'Browser reminders are enabled' : notificationPermission === 'denied' ? 'Notifications blocked in browser settings' : 'Permission needed to send browser notifications'}</div>{remindersEnabled ? <button className="secondary-button" onClick={onDisableReminders}>Pause reminders</button> : <button className="primary-button" onClick={onEnableReminders}>Enable browser reminders</button>}<small>Checks for overdue sessions, sessions due today and sessions scheduled for tomorrow while this app is open. Browser-closed delivery is not supported yet.</small></div>
    <div className="panel settings-panel"><div className="settings-icon"><Sparkles size={20}/></div><h3>1–4–7 method</h3><p>Default intervals are calculated from the original study date. Custom offsets can be set when creating a topic.</p><div className="plan-pills large"><span>1</span><span>4</span><span>7</span><span>14</span><span>30</span></div></div></div>
  </div>
}
function DatabaseIcon() { return <Activity size={20}/> }
