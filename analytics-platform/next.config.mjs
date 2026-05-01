const nextConfig = {
  // External packages that run only on the server (Node.js APIs)
  experimental: {
    serverComponentsExternalPackages: ['pg', 'ioredis', 'maxmind'],
  },

  // Remote images allowed for next/image
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sanity.io', port: '' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', port: '' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', port: '' },
      { protocol: 'https', hostname: 'pub-b7fd9c30cdbf439183b75041f5f71b92.r2.dev', port: '' },
    ],
  },

  // CORS headers for the analytics collection endpoint
  async headers() {
    return [
      {
        source: '/api/collect',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ]
  },

  compress: true,
}

export default nextConfig
