import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

// Shared Axios client so all API helpers inherit the same base URL and headers.
const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export default client
