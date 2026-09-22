'use client'

import { useEffect } from 'react'

export function ResultRedirect({ id }: { id: string }) {
  useEffect(() => {
    window.location.replace(`/?result=${id}`)
  }, [id])
  return null
}
