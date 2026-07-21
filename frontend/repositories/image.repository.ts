import { apiFetch } from './apiClient'

export interface UploadedImage {
  id: number
  url: string
  width: number
  height: number
}

/** Uploads go to the backend only — the frontend never talks to Supabase */
export const imageRepository = {
  upload(file: File): Promise<UploadedImage> {
    const body = new FormData()
    body.append('file', file)
    return apiFetch<UploadedImage>('/images', { method: 'POST', body })
  },
}
