import { Resend } from 'resend'
import { PLATFORM_NAME } from '@/lib/brand'

function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null
  return new Resend(apiKey)
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  `${PLATFORM_NAME} <onboarding@resend.dev>`

export async function sendClientOtpEmail(input: {
  to: string
  clientName: string
  otp: string
  portalUrl: string
}): Promise<{ devMode: boolean }> {
  const { to, clientName, otp, portalUrl } = input
  const resend = getResend()

  const html = `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 22px; margin-bottom: 8px;">Secure access to ${PLATFORM_NAME}</h1>
      <p style="color: #666; line-height: 1.6;">Hi ${clientName}, your CPA firm has invited you to upload tax documents securely.</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #0061FF; margin: 24px 0;">${otp}</p>
      <p style="color: #666; line-height: 1.6;">This code expires in 30 days. You can also open ${PLATFORM_NAME} directly:</p>
      <p><a href="${portalUrl}" style="display: inline-block; background: #0061FF; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Open ${PLATFORM_NAME}</a></p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">If you did not expect this email, you can ignore it.</p>
    </div>
  `

  if (!resend) {
    console.warn('[dev] RESEND_API_KEY missing — OTP email not sent')
    console.warn(`[dev] Portal URL: ${portalUrl}`)
    console.warn(`[dev] OTP for ${to}: ${otp}`)
    return { devMode: true }
  }

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${PLATFORM_NAME} access code`,
    html,
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error('Unable to send email. Please try again later.')
  }

  return { devMode: false }
}
