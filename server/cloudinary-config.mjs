function fromCloudinaryUrl(value) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'cloudinary:' || !parsed.hostname || !parsed.username || !parsed.password) return null
    return {
      cloud_name: parsed.hostname,
      api_key: decodeURIComponent(parsed.username),
      api_secret: decodeURIComponent(parsed.password),
      secure: true,
    }
  } catch {
    return null
  }
}

export function isValidCloudinaryUrl(value) {
  return Boolean(fromCloudinaryUrl(value))
}

export function resolveCloudinaryConfig(environment = process.env) {
  const cloudName = String(environment.CLOUDINARY_CLOUD_NAME || '').trim()
  const apiKey = String(environment.CLOUDINARY_API_KEY || '').trim()
  const apiSecret = String(environment.CLOUDINARY_API_SECRET || '').trim()
  if (cloudName && apiKey && apiSecret) {
    return { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true }
  }
  return fromCloudinaryUrl(environment.CLOUDINARY_URL)
}
