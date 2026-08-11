export class ApiError extends Error {
  status: number
  body: { error?: string; detail?: string } | null

  constructor(status: number, body: { error?: string; detail?: string } | null) {
    super(`API error ${status}`)
    this.status = status
    this.body = body
  }
}

export async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    let body: ApiError['body'] = null
    try {
      body = await res.json()
    } catch {
      // no JSON body — leave null
    }
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<T>
}
