import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Float, OrbitControls } from '@react-three/drei'
import { ArrowUpRight, Check, ClipboardList, Gauge, Target } from 'lucide-react'
import type { QaqcRecord, QaqcValue } from '@/lib/qaqc-api'
import './KpiRegisterDisplay.css'

type Props = { rows: QaqcRecord[]; project: string }

const fields = {
  title: ['KPI', 'KPI Name', 'Indicator', 'KRA', 'KRA Name', 'Performance Indicator', 'Measure'],
  target: ['Target', 'Target Value', 'KPI Target', 'Threshold'],
  current: ['Current Performance', 'Current', 'Current Value', 'Actual', 'Achievement', 'Result', 'Performance'],
  frequency: ['Frequency', 'Review Frequency', 'Reporting Frequency', 'Period'],
  status: ['Status', 'Performance Status', 'Rating', 'Health'],
  category: ['KRA', 'Category', 'Perspective', 'Department', 'Discipline'],
}

function lookup(row: QaqcRecord, candidates: string[]): QaqcValue | undefined {
  const entries = Object.entries(row)
  for (const candidate of candidates) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === candidate.toLowerCase())
    if (found?.[1] !== null && found?.[1] !== undefined && found?.[1] !== '') return found[1]
  }
  return undefined
}

function text(value: QaqcValue | undefined, fallback: string) {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function statusTone(value: string) {
  const status = value.toLowerCase()
  if (/risk|behind|fail|overdue|red|critical/.test(status)) return 'risk'
  if (/watch|pending|amber|review|progress/.test(status)) return 'watch'
  if (/on track|met|passed|complete|healthy|approved/.test(status)) return 'track'
  if (/reported/.test(status)) return 'reported'
  return 'watch'
}

function statusFor(row: QaqcRecord) {
  const explicitStatus = lookup(row, fields.status)
  if (explicitStatus !== undefined) return String(explicitStatus)
  return lookup(row, fields.current) === undefined ? 'Awaiting update' : 'Reported'
}

function ClipboardModel() {
  return <>
    <ambientLight intensity={1.7} />
    <directionalLight position={[4, 6, 7]} intensity={3.2} />
    <pointLight position={[-4, 2, 3]} color="#20c9df" intensity={15} distance={10} />
    <Float speed={1.1} rotationIntensity={0.035} floatIntensity={0.16}>
      <group rotation={[-0.1, -0.12, 0.02]}>
        <mesh castShadow receiveShadow position={[0, 0, -0.2]}>
          <boxGeometry args={[4.5, 5.8, 0.34]} />
          <meshStandardMaterial color="#0d4ba4" metalness={0.64} roughness={0.28} />
        </mesh>
        <mesh castShadow position={[0, 0, 0.01]}>
          <boxGeometry args={[4.24, 5.52, 0.16]} />
          <meshStandardMaterial color="#eef5ff" metalness={0.08} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0, 0.105]}>
          <planeGeometry args={[4.12, 5.4]} />
          <meshBasicMaterial color="#eef5ff" />
        </mesh>
        <mesh castShadow position={[0, 2.58, 0.18]}>
          <boxGeometry args={[1.22, 0.5, 0.3]} />
          <meshStandardMaterial color="#bfcde0" metalness={0.86} roughness={0.22} />
        </mesh>
        <mesh position={[0, 2.28, 0.19]}>
          <boxGeometry args={[3.93, 0.84, 0.12]} />
          <meshStandardMaterial color="#10396f" metalness={0.42} roughness={0.34} />
        </mesh>
        {[1.52, 0.78, 0.04, -0.7, -1.44, -2.18].map((y, index) => <group key={y} position={[0, y, 0.2]}>
          <mesh position={[-1.68, 0, 0]}>
            <boxGeometry args={[0.38, 0.38, 0.12]} />
            <meshStandardMaterial color={['#168de0', '#28b778', '#f0a12c', '#7258d8', '#168de0', '#10a9a2'][index]} metalness={0.18} roughness={0.4} />
          </mesh>
          <mesh position={[0.55, 0, -0.03]}>
            <boxGeometry args={[1.9, 0.06, 0.06]} />
            <meshStandardMaterial color="#a8b8cf" roughness={0.65} />
          </mesh>
          <mesh position={[1.66, 0, 0.04]}>
            <cylinderGeometry args={[0.15, 0.15, 0.1, 32]} />
            <meshStandardMaterial color={index === 5 ? '#ef9a1f' : '#10ac69'} metalness={0.18} roughness={0.35} />
          </mesh>
        </group>)}
      </group>
    </Float>
    <ContactShadows position={[0, -3.1, -0.5]} opacity={0.42} scale={8} blur={2.8} />
    <OrbitControls enablePan={false} enableZoom={false} minAzimuthAngle={-0.22} maxAzimuthAngle={0.22} minPolarAngle={1.45} maxPolarAngle={1.7} enableDamping dampingFactor={0.08} />
  </>
}

export function KpiRegisterDisplay({ rows, project }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const entries = useMemo(() => rows.map((row, index) => {
    const status = statusFor(row)
    return {
      index,
      title: text(lookup(row, fields.title), `KPI ${index + 1}`),
      target: text(lookup(row, fields.target), 'Not set'),
      current: text(lookup(row, fields.current), 'Not reported'),
      frequency: text(lookup(row, fields.frequency), 'Unspecified'),
      category: text(lookup(row, fields.category), 'Performance'),
      status,
      tone: statusTone(status),
    }
  }), [rows])
  const selected = entries[Math.min(selectedIndex, Math.max(entries.length - 1, 0))]
  const hasProjectScope = rows.some(row => Boolean(row.Project || row['Project/Area']))
  const reported = rows.filter(row => lookup(row, fields.current) !== undefined).length
  const awaiting = rows.length - reported

  return <section className="kpi-register-scene" aria-label="Interactive KPI register display">
    <header className="kpi-register-scene__header">
      <div><span className="kpi-register-scene__eyebrow">QUALITY CONTROL / LIVE REGISTER</span><h2>KPI Register</h2><p>{hasProjectScope ? `Project-specific indicators for ${project}.` : project === 'All Projects' ? 'Shared indicators across all projects.' : `Shared indicators applied to ${project}; this workbook register has no project-specific KPI rows.`}</p></div>
      <div className="kpi-register-scene__live"><i /> WORKBOOK SYNCED</div>
    </header>
    <div className="kpi-register-scene__body">
      <div className="kpi-register-scene__model" data-testid="kpi-register-3d">
        <div className="kpi-register-scene__model-grid" />
        <Canvas camera={{ position: [0, 0.25, 9.4], fov: 38 }} dpr={[1, 1.5]} shadows gl={{ antialias: true, alpha: false }}>
          <color attach="background" args={['#09182b']} />
          <fog attach="fog" args={['#09182b', 12, 20]} />
          <ClipboardModel />
        </Canvas>
        <div className="kpi-register-scene__model-title"><ClipboardList size={15} /><span>KPI REGISTER</span><small>{rows.length} INDICATORS</small></div>
        <div className="kpi-register-scene__model-footer"><span><Check size={13} /> {reported} reported</span><span><Target size={13} /> {awaiting} awaiting update</span></div>
      </div>
      <div className="kpi-register-scene__detail">
        <div className="kpi-register-scene__detail-top"><span><Gauge size={15} /> SELECTED INDICATOR</span><span>{String(selectedIndex + 1).padStart(2, '0')} / {String(rows.length).padStart(2, '0')}</span></div>
        {selected ? <>
          <p className="kpi-register-scene__category">{selected.category}</p>
          <h3>{selected.title}</h3>
          <div className="kpi-register-scene__values"><div><span>TARGET</span><strong>{selected.target}</strong></div><div><span>CURRENT</span><strong>{selected.current}</strong></div><div><span>FREQUENCY</span><strong>{selected.frequency}</strong></div></div>
          <div className={`kpi-register-scene__status is-${selected.tone}`}><i />{selected.status}</div>
        </> : <div className="kpi-register-scene__empty">{rows.length ? 'Select a KPI to see its details.' : 'No KPI rows are available for this project.'}</div>}
        <div className="kpi-register-scene__indicator-list" role="list" aria-label="KPI indicators">
          {entries.map(entry => <button key={`${entry.index}-${entry.title}`} type="button" aria-pressed={entry.index === selectedIndex} onClick={() => setSelectedIndex(entry.index)} className={entry.index === selectedIndex ? 'is-active' : ''}>
            <span className={`kpi-register-scene__index is-${entry.tone}`}>{entry.index + 1}</span><span className="kpi-register-scene__indicator-name">{entry.title}</span><span className={`kpi-register-scene__badge is-${entry.tone}`}>{entry.status}</span><ArrowUpRight size={14} />
          </button>)}
        </div>
      </div>
    </div>
  </section>
}