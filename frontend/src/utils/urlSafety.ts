export function safeExternalHref(value?: string | null): string | null {
  if (!value) return null

  const candidate = value.trim()
  if (!candidate) return null
  if (/\s/.test(candidate)) return null

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export function externalHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}
