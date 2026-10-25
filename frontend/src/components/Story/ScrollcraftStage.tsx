import { useEffect, useRef } from 'react'

interface Props {
  onNavigateToMap: (searchParams: URLSearchParams) => void
}

export default function ScrollcraftStage({ onNavigateToMap }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    function bindLinks() {
      const doc = iframe?.contentDocument
      if (!doc) return

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
        if (!anchor) return
        const href = anchor.getAttribute('href') || ''
        if (href.startsWith('/?mode=map')) {
          e.preventDefault()
          const q = href.split('?')[1] || 'mode=map'
          onNavigateToMap(new URLSearchParams(q))
        }
      }

      const handleSubmit = (e: Event) => {
        const form = e.target as HTMLFormElement | null
        if (!form || form.id !== 'hero-zip-form') return
        const input = form.querySelector('#hero-zip-input') as HTMLInputElement | null
        const val = input?.value?.trim() || ''
        // If it's a 5-digit ZIP that isn't one of the 5 inline presets, transition straight to the 3D Globe
        const presets = new Set(['95112', '27701', '10001', '78701', '60601'])
        if (/^\d{5}$/.test(val) && !presets.has(val)) {
          e.preventDefault()
          onNavigateToMap(new URLSearchParams(`mode=map&zip=${val}`))
        }
      }

      doc.addEventListener('click', handleClick)
      doc.addEventListener('submit', handleSubmit)
      return () => {
        doc.removeEventListener('click', handleClick)
        doc.removeEventListener('submit', handleSubmit)
      }
    }

    let cleanup: (() => void) | undefined
    const onLoad = () => {
      cleanup?.()
      cleanup = bindLinks()
    }

    iframe.addEventListener('load', onLoad)
    if (iframe.contentDocument?.readyState === 'complete') {
      cleanup = bindLinks()
    }

    return () => {
      iframe.removeEventListener('load', onLoad)
      cleanup?.()
    }
  }, [onNavigateToMap])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#080c14' }}>
      <iframe
        ref={iframeRef}
        src="/scrollcraft/index.html"
        title="RepMap Civic Cartography Story"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: '#080c14',
        }}
      />
    </div>
  )
}
