import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidCloudinaryUrl, resolveCloudinaryConfig } from './cloudinary-config.mjs'

test('resolves separate Cloudinary environment variables', () => {
  assert.deepEqual(resolveCloudinaryConfig({
    CLOUDINARY_CLOUD_NAME: 'example-cloud',
    CLOUDINARY_API_KEY: '123456789',
    CLOUDINARY_API_SECRET: 'secret-value',
  }), {
    cloud_name: 'example-cloud',
    api_key: '123456789',
    api_secret: 'secret-value',
    secure: true,
  })
})

test('supports a complete Cloudinary URL and decodes credentials', () => {
  const url = 'cloudinary://123456789:secret%40value@example-cloud'
  assert.equal(isValidCloudinaryUrl(url), true)
  assert.equal(resolveCloudinaryConfig({ CLOUDINARY_URL: url }).api_secret, 'secret@value')
})

test('rejects partial credentials and incomplete Cloudinary URLs', () => {
  assert.equal(resolveCloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'example-cloud', CLOUDINARY_API_KEY: '123' }), null)
  assert.equal(isValidCloudinaryUrl('cloudinary://123:secret-value'), false)
})
