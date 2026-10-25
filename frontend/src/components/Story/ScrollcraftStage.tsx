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
        if (!anchor || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        const href = anchor.getAttribute('href') || ''
        // Same-origin links to the map (`/`, `/?zip=…`, legacy `/?mode=map…`) stay in the SPA.
        if (href === '/' || href.startsWith('/?')) {
          e.preventDefault()
          onNavigateToMap(new URLSearchParams(href.slice(2)))
        }
      }

      const handleSubmit = (e: Event) => {
        const form = e.target as HTMLFormElement | null
        if (!form || form.id !== 'hero-zip-form') return
        const input = form.querySelector('#hero-zip-input') as HTMLInputElement | null
        const val = input?.value?.trim() || ''
        // A 5-digit ZIP that isn't one of the Story's preset chips opens the map at that ZIP.
        if (/^\d{5}$/.test(val) && !doc.querySelector(`.zip-chip[data-zip="${val}"]`)) {
          e.preventDefault()
          onNavigateToMap(new URLSearchParams({ zip: val }))
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
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <iframe
        ref={iframeRef}
        src="/scrollcraft/index.html"
        title="RepMap Civic Story"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  )
}
