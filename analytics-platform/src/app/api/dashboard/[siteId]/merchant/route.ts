import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { siteId: string } }
) {
  const siteId = parseInt(params.siteId, 10)
  if (isNaN(siteId)) return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 })

  const rows = await query(`
    SELECT id, page_url, listing_type, product_name,
           status, price, currency, availability,
           issues, last_checked
    FROM gsc_merchant_listings
    WHERE site_id = $1
    ORDER BY
      CASE status WHEN 'disapproved' THEN 0 WHEN 'warning' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
      last_checked DESC NULLS LAST
  `, [siteId])

  return NextResponse.json({ rows })
}
