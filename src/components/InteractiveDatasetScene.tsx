import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Group } from 'three'
import { Activity, ArrowUpRight, Boxes, ClipboardCheck, FileBarChart, FileText, HardHat, ShieldCheck } from 'lucide-react'
import './InteractiveDatasetScene.css'

export type DatasetSceneEntry = { name: string; records: number | null }

type Props = {
  datasets: DatasetSceneEntry[]
  loading: boolean
  error: string
  onOpenDataset: (name: string) => void
}

const palette = [
  { color: '#26c6da', tint: 'rgba(38, 198, 218, .14)', Icon: FileText },
  { color: '#55a8ff', tint: 'rgba(85, 168, 255, .14)', Icon: FileBarChart },
  { color: '#a58bff', tint: 'rgba(165, 139, 255, .14)', Icon: ClipboardCheck },
  { color: '#ffb84a', tint: 'rgba(255, 184, 74, .14)', Icon: Activity },
  { color: '#48d7a3', tint: 'rgba(72, 215, 163, .14)', Icon: HardHat },
  { color: '#ff7584', tint: 'rgba(255, 117, 132, .14)', Icon: ShieldCheck },
]

function DatabaseStack({ recordTotal, datasetCount }: { recordTotal: number | null; datasetCount: number }) {
  const stack = useRef<Group>(null)
  const { camera, size } = useThree()

  useFrame((_, delta) => {
    if (stack.current) stack.current.rotation.y += delta * 0.14
  })

  useEffect(() => {
    camera.position.set(0, size.width < 620 ? 1.7 : 1.8, size.width < 620 ? 15.8 : 13.4)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width])

  return <>
    <group ref={stack} position={[0, -0.55, 0]}>
      {[-0.78, -0.08, 0.62].map((y, index) => <group key={y} position={[0, y, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[1.08, 1.08, 0.58, 56]} />
          <meshStandardMaterial color={index === 1 ? '#1260c5' : '#0b4a9a'} metalness={0.78} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <torusGeometry args={[1.045, 0.035, 10, 64]} />
          <meshStandardMaterial color="#26d9ff" emissive="#0586ff" emissiveIntensity={1.7} metalness={0.45} roughness={0.2} />
        </mesh>
      </group>)}
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[1.08, 1.08, 0.12, 56]} />
        <meshStandardMaterial color="#398ef6" metalness={0.68} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.04, 56]} />
        <meshStandardMaterial color="#55a6ff" metalness={0.3} roughness={0.22} />
      </mesh>
    </group>

    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.75, 0]} receiveShadow>
      <circleGeometry args={[1.55, 64]} />
      <meshBasicMaterial color="#0a2750" transparent opacity={0.82} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <torusGeometry args={[3.45, 0.025, 8, 160]} />
      <meshStandardMaterial color="#2c89ff" emissive="#126cff" emissiveIntensity={0.7} />
    </mesh>
  </>
}

function DatasetOrbit({ recordTotal, datasetCount }: { recordTotal: number | null; datasetCount: number }) {
  return <>
    <color attach="background" args={['#071321']} />
    <fog attach="fog" args={['#071321', 12, 22]} />
    <ambientLight intensity={1.35} />
    <directionalLight position={[4, 7, 6]} intensity={3.1} castShadow />
    <pointLight position={[-4, 2, -3]} color="#147cff" intensity={22} distance={12} />
    <pointLight position={[2, -1, 4]} color="#16d9ff" intensity={9} distance={8} />
    <DatabaseStack recordTotal={recordTotal} datasetCount={datasetCount} />
    <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.95} maxPolarAngle={2.05} autoRotate autoRotateSpeed={0.22} enableDamping dampingFactor={0.08} />
  </>
}

export function InteractiveDatasetScene({ datasets, loading, error, onOpenDataset }: Props) {
  const [selected, setSelected] = useState(datasets[0]?.name || '')
  const activeDataset = datasets.find(dataset => dataset.name === selected) || datasets[0]
  const recordTotal = datasets.every(dataset => dataset.records !== null)
    ? datasets.reduce((sum, dataset) => sum + (dataset.records || 0), 0)
    : null
  useEffect(() => {
    if (!selected && datasets.length) setSelected(datasets[0].name)
  }, [datasets, selected])

  return <section className="dataset-hub" aria-label="Interactive operational dataset visualization">
    <div className="dataset-hub__topline">
      <div><span className="dataset-hub__eyebrow">LIVE WORKBOOK NETWORK</span><h3>Operational data field</h3></div>
      <span className={`dataset-hub__status${error ? ' is-offline' : ''}`}><i />{error ? 'SOURCE OFFLINE' : loading ? 'SYNCING' : 'LIVE SYNC'}</span>
    </div>
    <div className="dataset-hub__canvas" data-testid="dataset-3d-canvas">
      <div className="dataset-hub__grid" aria-hidden="true" />
      <Canvas camera={{ position: [0, 2.05, 10.8], fov: 42 }} dpr={[1, 1.65]} shadows gl={{ antialias: true, alpha: false }}>
        <DatasetOrbit recordTotal={recordTotal} datasetCount={datasets.length} />
      </Canvas>
      <div className="dataset-hub__orbit" aria-label="Select a workbook dataset">
        {datasets.map((dataset, index) => {
          const angle = (index / datasets.length) * Math.PI * 2 - Math.PI / 2
          const style = palette[index % palette.length]
          const Icon = style.Icon
          const active = dataset.name === selected
          return <button
            key={dataset.name}
            type="button"
            aria-pressed={active}
            onClick={() => setSelected(dataset.name)}
            className={`dataset-orbit-tile${active ? ' is-selected' : ''}`}
            style={{
              left: `${50 + Math.cos(angle) * 41}%`,
              top: `${49 + Math.sin(angle) * 37}%`,
              '--tile-color': style.color,
              '--tile-tint': style.tint,
            } as React.CSSProperties}
          >
            <span className="dataset-orbit-tile__icon"><Icon size={17} strokeWidth={2.2} /></span>
            <span className="dataset-orbit-tile__name">{dataset.name.replace(/_/g, ' ')}</span>
            <strong>{dataset.records === null ? '—' : dataset.records.toLocaleString()}</strong>
          </button>
        })}
      </div>
      <div className="dataset-hub-readout" aria-live="polite">
        <span className="dataset-hub-readout__eyebrow">WORKBOOK LIVE</span>
        <strong>{recordTotal === null ? '--' : recordTotal.toLocaleString()}</strong>
        <span>{datasets.length} operational feeds</span>
      </div>
      <div className="dataset-hub__summary" aria-live="polite">
        <div className="dataset-hub__summary-count"><Boxes size={16} /><span>{activeDataset?.records === null || activeDataset?.records === undefined ? '—' : activeDataset.records.toLocaleString()}</span></div>
        <div className="dataset-hub__summary-copy"><strong>{activeDataset?.name.replace(/_/g, ' ') || 'Workbook datasets'}</strong><span>{recordTotal === null ? 'Awaiting workbook sync' : `${recordTotal.toLocaleString()} records across ${datasets.length} datasets`}</span></div>
        <button type="button" disabled={!activeDataset} onClick={() => activeDataset && onOpenDataset(activeDataset.name)} aria-label={`Open ${activeDataset?.name || 'dataset'}`}><ArrowUpRight size={18} /></button>
      </div>
      <span className="dataset-hub__orbit-caption">DRAG TO ROTATE <span>·</span> SELECT A DATASET</span>
    </div>
  </section>
}